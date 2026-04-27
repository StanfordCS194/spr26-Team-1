"""Smoke tests that don't need ROS2 to be importable.

Run with: `python sdk_test.py`
"""
import sys
import unittest
from urllib.parse import parse_qs, urlparse

# Allow running from the repo root without installation.
sys.path.insert(0, ".")

from topolog_sdk.config import StreamConfig
from topolog_sdk.encoder import FfmpegEncoder
from topolog_sdk.pixel_formats import ros_encoding_to_ffmpeg_pixfmt


def _cfg(**overrides) -> StreamConfig:
    base = dict(
        topic="/camera/color/image_raw",
        stream_id="cam0",
        ingestion_url="srt://ingest.example.com:9999",
    )
    base.update(overrides)
    return StreamConfig(**base)


class TestStreamConfig(unittest.TestCase):
    def test_rejects_non_srt_url(self):
        with self.assertRaises(ValueError):
            _cfg(ingestion_url="rtmp://nope")

    def test_rejects_bad_message_type(self):
        with self.assertRaises(ValueError):
            _cfg(message_type="Video")

    def test_rejects_bad_qos(self):
        with self.assertRaises(ValueError):
            _cfg(qos="strict")


class TestSrtUrl(unittest.TestCase):
    def test_streamid_added(self):
        cfg = _cfg(stream_id="front_color")
        url = FfmpegEncoder.build_srt_url(cfg)
        parsed = urlparse(url)
        self.assertEqual(parsed.scheme, "srt")
        qs = parse_qs(parsed.query)
        self.assertEqual(qs["streamid"], ["front_color"])
        self.assertEqual(qs["mode"], ["caller"])
        self.assertEqual(qs["pkt_size"], ["1316"])

    def test_extra_srt_params_merged(self):
        cfg = _cfg(srt_params={"latency": 200000, "passphrase": "secret/key"})
        url = FfmpegEncoder.build_srt_url(cfg)
        qs = parse_qs(urlparse(url).query)
        self.assertEqual(qs["latency"], ["200000"])
        self.assertEqual(qs["passphrase"], ["secret/key"])

    def test_appends_to_existing_query(self):
        cfg = _cfg(ingestion_url="srt://ingest.example.com:9999?token=abc")
        url = FfmpegEncoder.build_srt_url(cfg)
        qs = parse_qs(urlparse(url).query)
        self.assertEqual(qs["token"], ["abc"])
        self.assertEqual(qs["streamid"], ["cam0"])


class TestFfmpegCommand(unittest.TestCase):
    def test_raw_command_shape(self):
        cfg = _cfg(fps=25, bitrate="2M")
        enc = FfmpegEncoder(cfg, mode="raw", width=1280, height=720,
                            pix_fmt_in="bgr24")
        cmd = enc.build_command()
        self.assertEqual(cmd[0], "ffmpeg")
        self.assertIn("-pixel_format", cmd)
        self.assertEqual(cmd[cmd.index("-pixel_format") + 1], "bgr24")
        self.assertIn("-video_size", cmd)
        self.assertEqual(cmd[cmd.index("-video_size") + 1], "1280x720")
        self.assertIn("-framerate", cmd)
        self.assertEqual(cmd[cmd.index("-framerate") + 1], "25")
        self.assertIn("libx264", cmd)
        self.assertIn("mpegts", cmd)
        self.assertTrue(cmd[-1].startswith("srt://"))
        self.assertIn("streamid=cam0", cmd[-1])

    def test_mjpeg_command_shape(self):
        cfg = _cfg()
        enc = FfmpegEncoder(cfg, mode="mjpeg")
        cmd = enc.build_command()
        self.assertIn("image2pipe", cmd)
        self.assertIn("mjpeg", cmd)
        self.assertIn("libx264", cmd)
        self.assertTrue(cmd[-1].startswith("srt://"))

    def test_png_command_shape(self):
        cfg = _cfg()
        enc = FfmpegEncoder(cfg, mode="png")
        cmd = enc.build_command()
        self.assertIn("image2pipe", cmd)
        self.assertIn("png", cmd)

    def test_raw_requires_dimensions(self):
        cfg = _cfg()
        with self.assertRaises(ValueError):
            FfmpegEncoder(cfg, mode="raw")

    def test_unknown_mode_rejected(self):
        cfg = _cfg()
        with self.assertRaises(ValueError):
            FfmpegEncoder(cfg, mode="hevc")

    def test_extra_args_passed_through(self):
        cfg = _cfg(extra_ffmpeg_args=["-bf", "0"])
        enc = FfmpegEncoder(cfg, mode="raw", width=640, height=480,
                            pix_fmt_in="rgb24")
        cmd = enc.build_command()
        self.assertIn("-bf", cmd)
        self.assertEqual(cmd[cmd.index("-bf") + 1], "0")


class TestPixelFormats(unittest.TestCase):
    def test_known_mappings(self):
        self.assertEqual(ros_encoding_to_ffmpeg_pixfmt("rgb8"), "rgb24")
        self.assertEqual(ros_encoding_to_ffmpeg_pixfmt("bgr8"), "bgr24")
        self.assertEqual(ros_encoding_to_ffmpeg_pixfmt("mono8"), "gray")
        self.assertEqual(ros_encoding_to_ffmpeg_pixfmt("mono16"), "gray16le")
        self.assertEqual(ros_encoding_to_ffmpeg_pixfmt("yuv422"), "uyvy422")
        self.assertEqual(ros_encoding_to_ffmpeg_pixfmt("bayer_rggb8"),
                         "bayer_rggb8")

    def test_unknown_returns_none(self):
        self.assertIsNone(ros_encoding_to_ffmpeg_pixfmt("does_not_exist"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
