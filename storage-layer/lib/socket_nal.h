#pragma once

#ifdef _WIN32
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #pragma comment(lib, "ws2_32.lib")
  using SocketHandle = SOCKET;
  static constexpr SocketHandle INVALID_SOCKET_HANDLE = INVALID_SOCKET;
  inline void closeSocket(SocketHandle s) { closesocket(s); }
  inline void initSockets() {
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
  }
  inline void cleanupSockets() { WSACleanup(); }
#else
  #include <sys/socket.h>
  #include <netinet/in.h>
  #include <unistd.h>
  using SocketHandle = int;
  static constexpr SocketHandle INVALID_SOCKET_HANDLE = -1;
  inline void closeSocket(SocketHandle s) { close(s); }
  inline void initSockets()   {}  // no-op on Linux
  inline void cleanupSockets() {} // no-op on Linux
#endif