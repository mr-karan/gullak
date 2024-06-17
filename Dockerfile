FROM golang:1.22.4 AS builder
WORKDIR /app/build
COPY go.mod ${WORKDIR}
COPY go.sum ${WORKDIR}
RUN go mod download && go mod verify 

# Downloading Node now
RUN curl -fsSL https://deb.nodesource.com/setup_18.x -o nodesource_setup.sh
RUN sh nodesource_setup.sh
RUN apt-get install -y nodejs 
RUN node -v && npm -v

# Now create gullak.bin
RUN npm install -g yarn
COPY . .
RUN make build


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
COPY --from=builder /usr/local/bin/gullak.bin ./gullak.bin
COPY config.sample.toml config.toml

# Set the entrypoint
EXPOSE 3333
RUN ls -lahtr
ENTRYPOINT ["/app/gullak.bin"]
CMD ["--config", "config.toml"]