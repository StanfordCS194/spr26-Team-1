CXX = g++
CXXFLAGS = -Wall -g -std=c++23

INCLUDES = -I./lib

MAIN_SOURCES  = $(wildcard *.cpp)

TARGETS = $(MAIN_SOURCES:.cpp=.exe)

all: $(TARGETS)

%.exe: %.cpp $(CLASS_SOURCES)
	$(CXX) $(CXXFLAGS) $(INCLUDES) $< $(CLASS_SOURCES) -o $@
	./$@
	-del /Q $@

clean:
	-del /Q *.exe

.PHONY: all clean