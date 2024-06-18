FROM node:alpine3.20

WORKDIR /app/ui

ENV API_URL="http://localhost:3333"
ENV UI_PORT=3334


COPY . .
RUN ["rm", "-rf", "package-lock.json"]
RUN ["npm", "install"]

EXPOSE ${UI_PORT}
ENTRYPOINT [ "npm", "run", "dev"]


