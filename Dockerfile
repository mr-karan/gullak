FROM ubuntu:24.04

# Update and install necessary packages
RUN apt-get update && \
    apt-get install -y ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user and switch to it
RUN useradd -m appuser
USER appuser

# Set working directory
WORKDIR /app

# Copy the binary
COPY gullak.bin .
COPY config.sample.toml config.toml

# Set the entrypoint
EXPOSE 7777
ENTRYPOINT ["./gullak.bin"]
CMD ["--config", "config.toml"]