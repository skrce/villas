ARG JRE_IMAGE
FROM ${JRE_IMAGE}
WORKDIR /app
COPY --chown=10001:10001 villas.jar /app/villas.jar
COPY --chown=10001:10001 web/ /app/web/
USER 10001:10001
ENV VILLAS_BIND_ADDRESS=0.0.0.0 VILLAS_PORT=9098 \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70.0 -XX:+ExitOnOutOfMemoryError -Djava.io.tmpdir=/tmp" \
    VILLAS_WEB_ROOT=/app/web
EXPOSE 9098
HEALTHCHECK --interval=30s --timeout=8s --start-period=60s --retries=3 CMD ["java", "-jar", "/app/villas.jar", "healthcheck"]
ENTRYPOINT ["java", "-jar", "/app/villas.jar"]
