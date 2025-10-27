FROM ubuntu:24.04
RUN apt-get -y update && apt install -y ca-certificates

WORKDIR /app

COPY gullak.bin .
COPY config.sample.toml config.toml

ARG GULLAK_GID="999"
ARG GULLAK_UID="999"

RUN addgroup --system --gid $GULLAK_GID gullak && \
    adduser --uid $GULLAK_UID --system --ingroup gullak gullak && \
    chown -R gullak:gullak /app

USER gullak
EXPOSE 3333

ENTRYPOINT [ "./gullak.bin" ]
CMD ["--config", "config.toml"]