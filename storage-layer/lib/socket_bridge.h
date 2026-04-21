// This program is responsible for bridging the C++ ingestor and Python script via a TCP socket.
#pragma once
#include "socket_nal.h"
#include <stdexcept>
#include <cstdint>

class BridgeSocket {
  SocketHandle sock_ = INVALID_SOCKET_HANDLE;

public:
  // Server side (C++ ingestor listens, Python connects)
  void listen(uint16_t port) {
    sock_ = socket(AF_INET, SOCK_STREAM, 0);
    if (sock_ == INVALID_SOCKET_HANDLE)
      throw std::runtime_error("socket() failed");

    sockaddr_in addr{};
    addr.sin_family      = AF_INET;
    addr.sin_port        = htons(port);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK); // localhost only

    // Allow port reuse
    int opt = 1;
    setsockopt(sock_, SOL_SOCKET, SO_REUSEADDR,
               reinterpret_cast<const char*>(&opt), sizeof(opt));

    if (bind(sock_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0)
      throw std::runtime_error("bind() failed");

    ::listen(sock_, 1);
  }

  // Blocks until Python script connects
  BridgeSocket accept() {
    BridgeSocket client;
    client.sock_ = ::accept(sock_, nullptr, nullptr);
    if (client.sock_ == INVALID_SOCKET_HANDLE)
      throw std::runtime_error("accept() failed");
    return client;
  }

  void sendPacket(const uint8_t* data, uint32_t size) {
    // Send length header first
    uint32_t net_size = htonl(size); // network byte order
    sendAll(reinterpret_cast<const uint8_t*>(&net_size), sizeof(net_size));
    sendAll(data, size);
  }

  // Receive a null-terminated string (used for PLY path back from Python)
  std::string recvString() {
    std::string result;
    char c;
    while (recv(sock_, &c, 1, 0) == 1 && c != '\n')
      result += c;
    return result;
  }

  void close() {
    if (sock_ != INVALID_SOCKET_HANDLE) {
      closeSocket(sock_);
      sock_ = INVALID_SOCKET_HANDLE;
    }
  }

  ~BridgeSocket() { close(); }

private:
  void sendAll(const uint8_t* data, uint32_t size) {
    uint32_t sent = 0;
    while (sent < size) {
      int n = send(sock_,
                   reinterpret_cast<const char*>(data + sent),
                   size - sent, 0);
      if (n <= 0) throw std::runtime_error("send() failed");
      sent += n;
    }
  }
};