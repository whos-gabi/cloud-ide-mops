FROM golang:1.25

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl bash \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["sleep", "infinity"]
