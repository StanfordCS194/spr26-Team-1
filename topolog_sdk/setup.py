from setuptools import find_packages, setup

package_name = "topolog_sdk"

setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests", "examples"]),
    data_files=[
        ("share/ament_index/resource_index/packages",
            ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
        ("share/" + package_name + "/examples",
            ["examples/config.yaml",
             "examples/single_camera.py",
             "examples/multi_camera.py"]),
    ],
    install_requires=["setuptools", "PyYAML"],
    zip_safe=True,
    maintainer="Topolog",
    maintainer_email="dev@topolog.ai",
    description="ROS2 -> SRT camera streaming SDK using ffmpeg for H.264 encoding.",
    license="Apache-2.0",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "topolog-stream = topolog_sdk.cli:main",
        ],
    },
)
