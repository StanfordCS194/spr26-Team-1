import shlex
import subprocess
import threading
from typing import List, Optional
from urllib.parse import quote

from .config import StreamConfig


class FfmpegEncoder:
    """Wraps an ffmpeg subprocess that reads frames on stdin and pushes
    H.264 / MPEG-TS over SRT.

    Two input modes:
        mode="raw"     — frames are concatenated rawvideo (one stride-packed
                         frame per write). Requires width/height/pix_fmt_in.
        mode="mjpeg"   — each write is a complete JPEG (image2pipe).
        mode="png"     — each write is a complete PNG (image2pipe).
    """

    def __init__(
        self,
        cfg: StreamConfig,
        mode: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        pix_fmt_in: Optional[str] = None,
    ) -> None:
        if mode not in ("raw", "mjpeg", "png"):
            raise ValueError(f"unknown mode: {mode}")
        if mode == "raw" and (width is None or height is None or pix_fmt_in is None):
            raise ValueError("raw mode requires width, height, pix_fmt_in")

        self.cfg = cfg
        self.mode = mode
        self.width = width
        self.height = height
        self.pix_fmt_in = pix_fmt_in

        self._proc: Optional[subprocess.Popen] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._stderr_sink = None  # callable(str) | None

    # ------------------------------------------------------------------ urls

    @staticmethod
    def build_srt_url(cfg: StreamConfig) -> str:
        params = {"streamid": cfg.stream_id, "pkt_size": "1316", "mode": "caller"}
        for k, v in cfg.srt_params.items():
            params[k] = v
        qs = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
        sep = "&" if "?" in cfg.ingestion_url else "?"
        return f"{cfg.ingestion_url}{sep}{qs}"

    # ------------------------------------------------------------------ cmd

    def build_command(self) -> List[str]:
        cfg = self.cfg
        cmd: List[str] = ["ffmpeg", "-hide_banner", "-loglevel", "warning"]
        cmd += list(cfg.extra_input_args)

        if self.mode == "raw":
            cmd += [
                "-f", "rawvideo",
                "-pixel_format", self.pix_fmt_in,
                "-video_size", f"{self.width}x{self.height}",
                "-framerate", str(cfg.fps),
                "-i", "pipe:0",
            ]
        elif self.mode == "mjpeg":
            cmd += [
                "-f", "image2pipe",
                "-vcodec", "mjpeg",
                "-framerate", str(cfg.fps),
                "-i", "pipe:0",
            ]
        else:  # png
            cmd += [
                "-f", "image2pipe",
                "-vcodec", "png",
                "-framerate", str(cfg.fps),
                "-i", "pipe:0",
            ]

        cmd += [
            "-c:v", "libx264",
            "-preset", cfg.preset,
            "-tune", cfg.tune,
            "-pix_fmt", cfg.pixel_format_out,
            "-b:v", cfg.bitrate,
            "-g", str(cfg.gop),
            "-an",
        ]
        cmd += list(cfg.extra_ffmpeg_args)
        cmd += ["-f", "mpegts", self.build_srt_url(cfg)]
        return cmd

    def command_string(self) -> str:
        return " ".join(shlex.quote(c) for c in self.build_command())

    # ------------------------------------------------------------------ proc

    def start(self, stderr_sink=None) -> None:
        if self._proc is not None:
            raise RuntimeError("encoder already started")
        self._stderr_sink = stderr_sink
        self._proc = subprocess.Popen(
            self.build_command(),
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
        self._stderr_thread = threading.Thread(
            target=self._drain_stderr, daemon=True
        )
        self._stderr_thread.start()

    def _drain_stderr(self) -> None:
        proc = self._proc
        if proc is None or proc.stderr is None:
            return
        for raw in iter(proc.stderr.readline, b""):
            if not raw:
                break
            if self._stderr_sink is not None:
                try:
                    self._stderr_sink(raw.decode(errors="replace").rstrip())
                except Exception:
                    pass

    def alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def write(self, payload: bytes) -> None:
        if self._proc is None or self._proc.stdin is None:
            raise BrokenPipeError("encoder not running")
        self._proc.stdin.write(payload)

    def stop(self, timeout: float = 2.0) -> None:
        proc = self._proc
        if proc is None:
            return
        try:
            if proc.stdin is not None:
                try:
                    proc.stdin.close()
                except Exception:
                    pass
            try:
                proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                proc.terminate()
                try:
                    proc.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    proc.kill()
        finally:
            self._proc = None
            if self._stderr_thread is not None:
                self._stderr_thread.join(timeout=0.5)
                self._stderr_thread = None
