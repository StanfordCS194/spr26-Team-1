CXX      = g++
CXXFLAGS = -Wall -g -std=c++23

ROS_DISTRO = jazzy
ROS_PATH   = /opt/ros/$(ROS_DISTRO)

ROS_INCLUDES = $(addprefix -I, $(wildcard $(ROS_PATH)/include/*))

INCLUDES  = -I./lib
INCLUDES += $(ROS_INCLUDES)
INCLUDES += $(shell pkg-config --cflags libavformat libavcodec libavutil libswscale)

LIBS  = -L$(ROS_PATH)/lib
LIBS += -L/usr/lib/x86_64-linux-gnu
LIBS += -lrclcpp
LIBS += -lsensor_msgs__rosidl_typesupport_cpp
LIBS += -lrcl_interfaces__rosidl_typesupport_cpp
LIBS += -lrcl
LIBS += -lrmw
LIBS += -lrcutils
LIBS += -ltracetools
LIBS += -lavformat
LIBS += -lavcodec
LIBS += -lavutil
LIBS += -lswscale

SOURCES  = $(wildcard *.cpp)
SOURCES += $(wildcard lib/*.cpp)

BUILD_DIR = build
OBJECTS   = $(patsubst %.cpp, $(BUILD_DIR)/%.o, $(SOURCES))
TARGET    = $(BUILD_DIR)/storage

.PRECIOUS: $(TARGET)

all: $(TARGET)
	./$(TARGET)

# Link
$(TARGET): $(OBJECTS)
	$(CXX) $(CXXFLAGS) $(OBJECTS) -o $(TARGET) $(LIBS)

# Compile — create subdirectories as needed
$(BUILD_DIR)/%.o: %.cpp
	mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -c $< -o $@

clean:
	-rm -rf $(BUILD_DIR)

.PHONY: all clean