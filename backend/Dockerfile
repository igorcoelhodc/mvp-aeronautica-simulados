# Estágio de build
FROM golang:1.23-alpine AS builder

WORKDIR /src

RUN apk add --no-cache git ca-certificates

COPY go.mod ./
COPY . .

RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# Estágio final mínimo
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata && \
    adduser -D -H -u 10001 appuser

WORKDIR /app
COPY --from=builder /out/api /app/api

USER appuser

EXPOSE 8080

ENTRYPOINT ["/app/api"]
