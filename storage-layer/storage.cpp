#include <iostream>
#include "video_ingestor.hpp"

int main(int argc, char** argv) {
    std::cout << "Starting video ingestor node..." << std::endl;
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<VideoIngestor>("srt://0.0.0.0:9000", 0));
    rclcpp::shutdown();
    return 0;
}