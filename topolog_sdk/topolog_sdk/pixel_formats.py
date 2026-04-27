"""ROS sensor_msgs/Image encoding -> ffmpeg -pix_fmt name."""

ROS_TO_FFMPEG = {
    # RGB / BGR
    "rgb8": "rgb24",
    "rgba8": "rgba",
    "bgr8": "bgr24",
    "bgra8": "bgra",
    "rgb16": "rgb48le",
    "bgr16": "bgr48le",
    # Mono
    "mono8": "gray",
    "mono16": "gray16le",
    # cv_bridge generic types — assume packed, channel order matches OpenCV (BGR).
    "8UC1": "gray",
    "8UC3": "bgr24",
    "8UC4": "bgra",
    "16UC1": "gray16le",
    # YUV
    "yuv422": "uyvy422",
    "yuv422_yuy2": "yuyv422",
    # Bayer
    "bayer_rggb8": "bayer_rggb8",
    "bayer_bggr8": "bayer_bggr8",
    "bayer_gbrg8": "bayer_gbrg8",
    "bayer_grbg8": "bayer_grbg8",
}


def ros_encoding_to_ffmpeg_pixfmt(encoding: str):
    return ROS_TO_FFMPEG.get(encoding)
