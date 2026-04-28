#!/usr/bin/env python3
"""
Spoofs a drone SRT stream by generating a test pattern via FFmpeg
and streaming it to the ingestor's SRT listener.
"""
import subprocess
import time
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=9000, type=int)
    parser.add_argument('--duration', default=10, type=int)
    args = parser.parse_args()

    srt_url = f"srt://{args.host}:{args.port}"

    print(f"Streaming test pattern to {srt_url} for {args.duration}s...")

    cmd = [
        "ffmpeg",
        "-re",                          # real-time rate
        # "-f",      "lavfi",             # use lavfi virtual input
        # "-i",      f"testsrc=duration={args.duration}:size=1280x720:rate=30",
        "-i",      "test.mov",           # use a real video file as input
        "-c:v",    "libx264",           # encode as H.264
        "-preset", "ultrafast",
        "-tune",   "zerolatency",
        "-f",      "mpegts",            # MPEG-TS container (SRT carries this)
        srt_url
    ]

    try:
        result = subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg failed: {e}")
    except KeyboardInterrupt:
        print("Stopped.")

if __name__ == "__main__":
    main()