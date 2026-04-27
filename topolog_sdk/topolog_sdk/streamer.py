import queue
import threading
import time
from typing import Optional

from rclpy.callback_groups import MutuallyExclusiveCallbackGroup
from rclpy.node import Node
from rclpy.qos import (
    HistoryPolicy,
    QoSProfile,
    ReliabilityPolicy,
    qos_profile_sensor_data,
)
from sensor_msgs.msg import CompressedImage, Image

from .config import StreamConfig
from .encoder import FfmpegEncoder
from .pixel_formats import ros_encoding_to_ffmpeg_pixfmt


def _to_bytes(payload) -> bytes:
    # rclpy delivers msg.data as numpy uint8 array, array.array('B'),
    # bytes, or list depending on version — normalize to bytes.
    if isinstance(payload, (bytes, bytearray, memoryview)):
        return bytes(payload)
    tobytes = getattr(payload, "tobytes", None)
    if callable(tobytes):
        return tobytes()
    return bytes(payload)


class CameraStreamer:
    """Subscribes to one ROS2 camera topic and streams its frames over SRT.

    On the first message we inspect the payload to learn (width, height,
    pixel format) for raw Image, or the codec format for CompressedImage,
    then spawn an ffmpeg process and start a writer thread. Subsequent
    messages are pushed into a bounded queue; if the queue is full we drop
    the oldest frame so the publisher side never blocks.
    """

    def __init__(self, node: Node, cfg: StreamConfig) -> None:
        self.node = node
        self.cfg = cfg
        self._log = node.get_logger().get_child(f"stream.{cfg.stream_id}")

        self._encoder: Optional[FfmpegEncoder] = None
        self._mode: Optional[str] = None  # "raw" | "mjpeg" | "png"
        self._raw_pix_fmt: Optional[str] = None
        self._raw_width: Optional[int] = None
        self._raw_height: Optional[int] = None
        self._raw_expected_step: Optional[int] = None

        self._queue: "queue.Queue[Optional[bytes]]" = queue.Queue(
            maxsize=cfg.queue_size
        )
        self._writer_thread: Optional[threading.Thread] = None
        self._init_lock = threading.Lock()
        self._initialized = False
        self._stopped = False
        self._cb_group = MutuallyExclusiveCallbackGroup()

        msg_type = cfg.message_type
        if msg_type == "auto":
            msg_type = self._auto_detect_type()

        qos = self._build_qos()
        if msg_type == "CompressedImage":
            self._sub = node.create_subscription(
                CompressedImage,
                cfg.topic,
                self._on_compressed,
                qos,
                callback_group=self._cb_group,
            )
        else:
            self._sub = node.create_subscription(
                Image,
                cfg.topic,
                self._on_raw,
                qos,
                callback_group=self._cb_group,
            )
        self._log.info(
            f"subscribed topic={cfg.topic} type={msg_type} qos={cfg.qos} "
            f"-> {cfg.ingestion_url} streamid={cfg.stream_id}"
        )

    # -------------------------------------------------------------- lifecycle

    def _build_qos(self) -> QoSProfile:
        if self.cfg.qos == "reliable":
            return QoSProfile(
                reliability=ReliabilityPolicy.RELIABLE,
                history=HistoryPolicy.KEEP_LAST,
                depth=10,
            )
        return qos_profile_sensor_data

    def _auto_detect_type(self) -> str:
        # Best-effort: inspect existing publishers; otherwise default to Image
        # but downgrade to CompressedImage if the topic name ends in /compressed.
        try:
            infos = self.node.get_publishers_info_by_topic(self.cfg.topic)
            for info in infos:
                t = getattr(info, "topic_type", "")
                if t.endswith("CompressedImage"):
                    return "CompressedImage"
                if t.endswith("Image"):
                    return "Image"
        except Exception:
            pass
        if self.cfg.topic.rstrip("/").endswith("/compressed"):
            return "CompressedImage"
        return "Image"

    def stop(self) -> None:
        if self._stopped:
            return
        self._stopped = True
        try:
            self._queue.put_nowait(None)  # wake writer
        except queue.Full:
            pass
        if self._writer_thread is not None:
            self._writer_thread.join(timeout=2.0)
        if self._encoder is not None:
            self._encoder.stop()
            self._encoder = None

    # -------------------------------------------------------------- callbacks

    def _on_raw(self, msg: Image) -> None:
        if self._stopped:
            return
        if not self._initialized:
            with self._init_lock:
                if not self._initialized:
                    pix_fmt = ros_encoding_to_ffmpeg_pixfmt(msg.encoding)
                    if pix_fmt is None:
                        self._log.error(
                            f"unsupported ROS encoding {msg.encoding!r}; "
                            f"add a mapping in pixel_formats.py"
                        )
                        return
                    if msg.width <= 0 or msg.height <= 0:
                        self._log.error(
                            f"invalid frame dimensions {msg.width}x{msg.height}"
                        )
                        return
                    self._mode = "raw"
                    self._raw_pix_fmt = pix_fmt
                    self._raw_width = int(msg.width)
                    self._raw_height = int(msg.height)
                    bpp = max(1, int(msg.step) // int(msg.width))
                    self._raw_expected_step = int(msg.width) * bpp
                    self._start_encoder()
                    self._log.info(
                        f"detected {msg.width}x{msg.height} {msg.encoding} "
                        f"-> ffmpeg pix_fmt={pix_fmt}"
                    )

        payload = self._normalize_raw(msg)
        if payload is not None:
            self._enqueue(payload)

    def _on_compressed(self, msg: CompressedImage) -> None:
        if self._stopped:
            return
        if not self._initialized:
            with self._init_lock:
                if not self._initialized:
                    fmt = (msg.format or "").lower()
                    if "png" in fmt:
                        self._mode = "png"
                    elif "jpeg" in fmt or "jpg" in fmt or "mjpeg" in fmt or fmt == "":
                        # Empty format string is common; default to mjpeg
                        # since image_transport/compressed publishes JPEG.
                        self._mode = "mjpeg"
                    else:
                        self._log.error(
                            f"unsupported CompressedImage format {msg.format!r}"
                        )
                        return
                    self._start_encoder()
                    self._log.info(
                        f"detected compressed format={msg.format or 'jpeg(default)'} "
                        f"-> ffmpeg input={self._mode}"
                    )

        self._enqueue(_to_bytes(msg.data))

    # -------------------------------------------------------------- helpers

    def _normalize_raw(self, msg: Image) -> Optional[bytes]:
        # Strip row padding if msg.step != width * bpp so ffmpeg rawvideo
        # (which is always tightly packed) gets a clean frame.
        if msg.width != self._raw_width or msg.height != self._raw_height:
            self._log.warn(
                f"frame size changed mid-stream "
                f"({self._raw_width}x{self._raw_height} -> {msg.width}x{msg.height}); "
                f"dropping frame"
            )
            return None
        data = _to_bytes(msg.data)
        expected = self._raw_expected_step
        if msg.step == expected:
            return data
        out = bytearray(expected * msg.height)
        for r in range(msg.height):
            src = r * msg.step
            dst = r * expected
            out[dst : dst + expected] = data[src : src + expected]
        return bytes(out)

    def _start_encoder(self) -> None:
        sink = self._log.warn if self.cfg.log_ffmpeg else None
        enc = FfmpegEncoder(
            self.cfg,
            mode=self._mode,
            width=self._raw_width,
            height=self._raw_height,
            pix_fmt_in=self._raw_pix_fmt,
        )
        self._log.debug(f"ffmpeg cmd: {enc.command_string()}")
        enc.start(stderr_sink=sink)
        self._encoder = enc
        self._writer_thread = threading.Thread(
            target=self._writer_loop, name=f"srt-writer-{self.cfg.stream_id}",
            daemon=True,
        )
        self._writer_thread.start()
        self._initialized = True

    def _enqueue(self, payload: bytes) -> None:
        try:
            self._queue.put_nowait(payload)
        except queue.Full:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
            try:
                self._queue.put_nowait(payload)
            except queue.Full:
                pass

    def _writer_loop(self) -> None:
        backoff = 1.0
        while not self._stopped:
            try:
                payload = self._queue.get(timeout=0.5)
            except queue.Empty:
                if self._encoder is not None and not self._encoder.alive():
                    self._handle_dead_encoder(backoff)
                    backoff = min(backoff * 2, 30.0)
                continue
            if payload is None:
                break
            if self._encoder is None or not self._encoder.alive():
                self._handle_dead_encoder(backoff)
                backoff = min(backoff * 2, 30.0)
                if self._encoder is None or not self._encoder.alive():
                    continue
                backoff = 1.0
            try:
                self._encoder.write(payload)
            except (BrokenPipeError, OSError) as e:
                self._log.warn(f"ffmpeg write failed: {e}; will reconnect")
                if self._encoder is not None:
                    self._encoder.stop()
                    self._encoder = None

    def _handle_dead_encoder(self, backoff: float) -> None:
        self._log.warn(
            f"ffmpeg not running; reconnecting in {backoff:.1f}s"
        )
        time.sleep(backoff)
        if self._stopped:
            return
        try:
            self._start_encoder_again()
        except Exception as e:  # noqa: BLE001
            self._log.error(f"reconnect failed: {e}")

    def _start_encoder_again(self) -> None:
        # Re-init using cached parameters; avoid touching _initialized flag
        # so callbacks don't try to start a parallel encoder.
        if self._encoder is not None:
            self._encoder.stop()
            self._encoder = None
        sink = self._log.warn if self.cfg.log_ffmpeg else None
        enc = FfmpegEncoder(
            self.cfg,
            mode=self._mode,
            width=self._raw_width,
            height=self._raw_height,
            pix_fmt_in=self._raw_pix_fmt,
        )
        enc.start(stderr_sink=sink)
        self._encoder = enc
