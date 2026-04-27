from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class StreamConfig:
    """Per-camera streaming configuration.

    Required:
        topic:          ROS2 topic name (e.g. "/camera/color/image_raw").
        stream_id:      Identifier passed via SRT `streamid=` query param.
                        Must be unique per camera so the ingestion endpoint
                        can distinguish concurrent feeds.
        ingestion_url:  SRT base URL, e.g. "srt://ingest.example.com:9999".
                        Extra query params can be supplied via `srt_params`.

    The transport always negotiates SRT in caller mode and emits an MPEG-TS
    container carrying H.264. Frame width, height, and pixel format are
    auto-detected from the first ROS message — `fps` only affects the
    timestamp the encoder stamps onto frames.
    """

    topic: str
    stream_id: str
    ingestion_url: str

    message_type: str = "auto"  # "Image" | "CompressedImage" | "auto"

    fps: float = 30.0
    bitrate: str = "4M"
    preset: str = "ultrafast"
    tune: str = "zerolatency"
    gop: int = 60
    pixel_format_out: str = "yuv420p"

    queue_size: int = 30
    qos: str = "sensor_data"  # "sensor_data" | "reliable"

    srt_params: Dict[str, Any] = field(default_factory=dict)
    extra_input_args: List[str] = field(default_factory=list)
    extra_ffmpeg_args: List[str] = field(default_factory=list)

    log_ffmpeg: bool = False  # forward ffmpeg stderr to ROS logger

    def __post_init__(self) -> None:
        if self.message_type not in ("auto", "Image", "CompressedImage"):
            raise ValueError(
                f"message_type must be 'auto', 'Image', or 'CompressedImage' "
                f"(got {self.message_type!r})"
            )
        if self.qos not in ("sensor_data", "reliable"):
            raise ValueError(
                f"qos must be 'sensor_data' or 'reliable' (got {self.qos!r})"
            )
        if not self.ingestion_url.startswith("srt://"):
            raise ValueError(
                f"ingestion_url must be an srt:// URL (got {self.ingestion_url!r})"
            )
