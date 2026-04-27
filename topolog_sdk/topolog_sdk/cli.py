import argparse
import sys
from typing import List

from .config import StreamConfig
from .pipeline import StreamingPipeline


def load_configs(path: str) -> List[StreamConfig]:
    import yaml  # local import so import-time failures are user-visible

    with open(path, "r") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict) or "streams" not in data:
        raise ValueError(f"{path}: top-level mapping with 'streams:' key required")
    streams = data["streams"]
    if not isinstance(streams, list) or not streams:
        raise ValueError(f"{path}: 'streams' must be a non-empty list")
    return [StreamConfig(**s) for s in streams]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="topolog-stream",
        description="Stream ROS2 camera topics to an SRT ingestion endpoint.",
    )
    parser.add_argument("--config", "-c", required=True, help="path to YAML config")
    parser.add_argument(
        "--node-name", default="topolog_streamer", help="ROS2 node name"
    )
    args = parser.parse_args(argv)

    configs = load_configs(args.config)
    pipeline = StreamingPipeline(configs, node_name=args.node_name)
    pipeline.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
