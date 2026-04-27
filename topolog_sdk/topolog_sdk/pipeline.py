from typing import Iterable, List, Optional

import rclpy
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node

from .config import StreamConfig
from .streamer import CameraStreamer


class StreamingPipeline:
    """Top-level entry point. Spins one ROS2 node hosting a CameraStreamer
    per StreamConfig under a multi-threaded executor so cameras are
    serviced in parallel.
    """

    def __init__(
        self,
        configs: Iterable[StreamConfig],
        node_name: str = "topolog_streamer",
    ) -> None:
        self.configs: List[StreamConfig] = list(configs)
        if not self.configs:
            raise ValueError("StreamingPipeline requires at least one StreamConfig")
        self._validate_unique_stream_ids()
        self.node_name = node_name
        self._node: Optional[Node] = None
        self._streamers: List[CameraStreamer] = []
        self._executor: Optional[MultiThreadedExecutor] = None

    def _validate_unique_stream_ids(self) -> None:
        seen = set()
        for c in self.configs:
            if c.stream_id in seen:
                raise ValueError(f"duplicate stream_id: {c.stream_id!r}")
            seen.add(c.stream_id)

    def run(self) -> None:
        owns_init = not rclpy.ok()
        if owns_init:
            rclpy.init()
        try:
            self._node = Node(self.node_name)
            for cfg in self.configs:
                self._streamers.append(CameraStreamer(self._node, cfg))
            n_threads = max(2, len(self._streamers) + 1)
            self._executor = MultiThreadedExecutor(num_threads=n_threads)
            self._executor.add_node(self._node)
            self._node.get_logger().info(
                f"topolog_sdk streaming {len(self._streamers)} cameras "
                f"({n_threads} executor threads)"
            )
            try:
                self._executor.spin()
            except KeyboardInterrupt:
                pass
        finally:
            self.shutdown()
            if owns_init and rclpy.ok():
                rclpy.shutdown()

    def shutdown(self) -> None:
        for s in self._streamers:
            try:
                s.stop()
            except Exception:
                pass
        self._streamers.clear()
        if self._executor is not None:
            try:
                self._executor.shutdown()
            except Exception:
                pass
            self._executor = None
        if self._node is not None:
            try:
                self._node.destroy_node()
            except Exception:
                pass
            self._node = None
