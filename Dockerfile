FROM ubuntu:24.04
RUN apt-get -y update && apt install -y ca-certificates

WORKDIR /app

COPY gullak.bin .
COPY config.sample.toml config.toml

ARG GULLAK_GID="999"
ARG GULLAK_UID="999"

RUN groupadd --system --gid $GULLAK_GID gullak && \
    useradd --uid $GULLAK_UID --system --gid gullak --no-create-home gullak && \
    chown -R gullak:gullak /app

USER gullak
EXPOSE 3333

ENTRYPOINT [ "./gullak.bin" ]
CMD ["--config", "config.toml"]