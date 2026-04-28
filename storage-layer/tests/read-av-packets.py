#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage
import av
import cv2
import threading
import queue
from http.server import HTTPServer, BaseHTTPRequestHandler
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

latest_jpeg = b""
jpeg_lock   = threading.Lock()

class MjpegHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            # Serve a simple HTML page with auto-refreshing MJPEG stream
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b"""
                <html>
                <head><title>Drone Video</title></head>
                <body style="background:black;margin:0">
                <img src="/stream" style="width:100%;height:100vh;object-fit:contain"/>
                </body>
                </html>
            """)

        elif self.path == '/stream':
            # MJPEG stream endpoint
            self.send_response(200)
            self.send_header('Content-Type',
                             'multipart/x-mixed-replace; boundary=frame')
            self.end_headers()

            try:
                while True:
                    with jpeg_lock:
                        frame = latest_jpeg

                    if frame:
                        self.wfile.write(b"--frame\r\n")
                        self.send_header('Content-Type',  'image/jpeg')
                        self.send_header('Content-Length', len(frame))
                        self.end_headers()
                        self.wfile.write(frame)
                        self.wfile.write(b"\r\n")

            except (BrokenPipeError, ConnectionResetError):
                pass  # client disconnected

    def log_message(self, *args):
        pass  # suppress access logs

def start_server(port=8080):
    server = HTTPServer(('0.0.0.0', port), MjpegHandler)
    print(f"MJPEG stream at http://localhost:{port}")
    server.serve_forever()

class PacketReader(Node):
    def __init__(self):
        super().__init__('packet_reader')

        self.codec        = av.CodecContext.create('h264', 'r')
        self.packet_queue = queue.Queue(maxsize=500)

        qos = QoSProfile(
            depth=500,
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_ALL
        )

        self.subscription = self.create_subscription(
            CompressedImage,
            'video_source_0',
            self.on_packet,
            qos)

        self.decode_thread = threading.Thread(
            target=self.decode_loop, daemon=True)
        self.decode_thread.start()

        self.get_logger().info("Listening on video_source_0...")

    def on_packet(self, msg):
        try:
            self.packet_queue.put_nowait(bytes(msg.data))
        except queue.Full:
            self.get_logger().warn("Packet queue full, dropping packet")

    def decode_loop(self):
        global latest_jpeg
        frame_count = 0

        while True:
            raw = self.packet_queue.get()
            try:
                pkt = av.Packet(raw)
                for frame in self.codec.decode(pkt):
                    bgr = frame.to_ndarray(format='bgr24')

                    # Encode to JPEG for streaming
                    _, jpeg = cv2.imencode('.jpg', bgr,
                                          [cv2.IMWRITE_JPEG_QUALITY, 85])
                    with jpeg_lock:
                        latest_jpeg = jpeg.tobytes()

                    frame_count += 1
                    self.get_logger().info(f"Frame {frame_count} decoded")

            except Exception as e:
                self.get_logger().warn(f"Decode error: {e}")

def main():
    # Start MJPEG server in background
    server_thread = threading.Thread(
        target=start_server, daemon=True)
    server_thread.start()

    rclpy.init()
    node = PacketReader()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        rclpy.shutdown()

if __name__ == "__main__":
    main()