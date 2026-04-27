"""Stream one ROS2 camera topic to an SRT endpoint."""
from topolog_sdk import StreamConfig, StreamingPipeline


def main() -> None:
    cfg = StreamConfig(
        topic="/camera/color/image_raw",
        message_type="Image",
        stream_id="front_color",
        ingestion_url="srt://ingest.example.com:9999",
        fps=30,
        bitrate="4M",
    )
    StreamingPipeline([cfg]).run()


if __name__ == "__main__":
    main()
