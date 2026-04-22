#!/usr/bin/env python3
"""
Subscribes to the drone/video/compressed topic and prints
incoming packet info to verify the ingestor is publishing correctly.
"""
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage
import struct

class PacketReader(Node):
    def __init__(self):
        super().__init__('packet_reader')

        self.packet_count = 0
        self.total_bytes  = 0

        self.subscription = self.create_subscription(
            CompressedImage,
            'video_source_0',
            self.on_packet,
            10)

        self.get_logger().info("Listening on /video_source_0...")

    def on_packet(self, msg):
        self.packet_count += 1
        self.total_bytes  += len(msg.data)

        # Peek at first byte to determine NAL unit type
        nal_type = None
        if len(msg.data) >= 5:
            # Annex B: skip 4 byte start code, read NAL type
            nal_type = msg.data[4] & 0x1F

        nal_names = {
            1: "P-frame",
            5: "IDR (keyframe)",
            7: "SPS",
            8: "PPS",
            6: "SEI"
        }
        nal_name = nal_names.get(nal_type, f"unknown ({nal_type})")

        self.get_logger().info(
            f"[{self.packet_count:04d}] "
            f"format={msg.format} "
            f"size={len(msg.data)} bytes "
            f"nal={nal_name} "
            f"stamp={msg.header.stamp.sec}.{msg.header.stamp.nanosec:09d} "
            f"total_received={self.total_bytes} bytes"
        )

def main():
    rclpy.init()
    node = PacketReader()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        node.get_logger().info(
            f"Shutting down. "
            f"Received {node.packet_count} packets "
            f"({node.total_bytes} bytes total)"
        )
    finally:
        rclpy.shutdown()

if __name__ == "__main__":
    main()