"""Stream multiple ROS2 camera topics to the same SRT ingestion endpoint
with distinct stream IDs, mixing raw Image and CompressedImage sources."""
from topolog_sdk import StreamConfig, StreamingPipeline


def main() -> None:
    configs = [
        StreamConfig(
            topic="/front/color/image_raw",
            message_type="Image",
            stream_id="front",
            ingestion_url="srt://ingest.example.com:9999",
            fps=30,
            bitrate="4M",
        ),
        StreamConfig(
            topic="/rear/image_raw/compressed",
            message_type="CompressedImage",
            stream_id="rear",
            ingestion_url="srt://ingest.example.com:9999",
            fps=30,
            bitrate="4M",
        ),
        StreamConfig(
            topic="/depth/image_rect_raw",
            message_type="Image",
            stream_id="depth",
            ingestion_url="srt://ingest.example.com:9999",
            fps=30,
            bitrate="2M",
        ),
    ]
    StreamingPipeline(configs).run()


if __name__ == "__main__":
    main()
