#pragma once

#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/compressed_image.hpp>
#include <thread>

extern "C" {
  #include <libavformat/avformat.h>
  #include <libavcodec/avcodec.h>
  #include <libavutil/avutil.h>
  #include <libswscale/swscale.h>
}

class VideoIngestor : public rclcpp::Node {
  AVFormatContext* fmt_ctx_   = nullptr;
  int              video_idx_ = -1;
  int              node_id_   = 0;
  std::thread      ingest_thread_;

  rclcpp::Publisher<sensor_msgs::msg::CompressedImage>::SharedPtr publisher_;

public:
  VideoIngestor(const std::string& srt_url, int node_id)
    : Node("video_ingestor"), node_id_(node_id) {

    publisher_ = create_publisher<sensor_msgs::msg::CompressedImage>(
                   "video_source_" + std::to_string(node_id_), 10);

    if (!openIngest(srt_url)) {
      RCLCPP_ERROR(get_logger(), "Failed to open SRT stream");
      return;
    }

    ingest_thread_ = std::thread(&VideoIngestor::run, this);
  }

  ~VideoIngestor() {
    if (ingest_thread_.joinable())
      ingest_thread_.join();
    if (fmt_ctx_)
      avformat_close_input(&fmt_ctx_);
  }

private:
  bool openIngest(const std::string& srt_url) {
    AVDictionary* opts = nullptr;
    av_dict_set(&opts, "timeout",   "5000000",  0);
    av_dict_set(&opts, "mode",      "listener", 0);
    av_dict_set(&opts, "transtype", "live",     0);
    av_dict_set(&opts, "reuseaddr", "1",        0);

    if (avformat_open_input(&fmt_ctx_,
                            srt_url.c_str(),
                            nullptr, &opts) < 0)
      return false;

    if (avformat_find_stream_info(fmt_ctx_, nullptr) < 0)
      return false;

    video_idx_ = av_find_best_stream(fmt_ctx_,
                                     AVMEDIA_TYPE_VIDEO,
                                     -1, -1, nullptr, 0);
    return video_idx_ >= 0;
  }

  void run() {
    RCLCPP_INFO(get_logger(), "Ingest thread started...");
    AVPacket* pkt = av_packet_alloc();
    int packet_count = 0;

    while (av_read_frame(fmt_ctx_, pkt) >= 0) {
      if (pkt->stream_index == video_idx_) {
        packet_count++;
        RCLCPP_INFO(get_logger(),
                    "Packet %d: size=%d pts=%ld",
                    packet_count, pkt->size, pkt->pts);
        publishPacket(pkt);
      }
      av_packet_unref(pkt);
    }

    RCLCPP_INFO(get_logger(),
                "Ingest thread stopped. Total packets: %d", packet_count);
    av_packet_free(&pkt);
  }

  void publishPacket(AVPacket* pkt) {
    sensor_msgs::msg::CompressedImage msg;
    msg.header.stamp    = now();
    msg.header.frame_id = "video_source_" + std::to_string(node_id_);
    msg.format          = "h264";
    msg.data.assign(pkt->data, pkt->data + pkt->size);
    publisher_->publish(msg);
  }
};