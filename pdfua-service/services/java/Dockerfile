# PDF/UA Java Service - OpenHTMLtoPDF
FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /build

# Copy pom.xml and download dependencies
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source and build
COPY src/ ./src/
RUN mvn package -DskipTests -B

# Runtime image
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

# Install fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    fontconfig \
    curl \
    icc-profiles-free \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f -v

# Copy JAR from builder
COPY --from=builder /build/target/*.jar app.jar

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# JVM options for container
ENV JAVA_OPTS="-Xmx512m -Xms256m"

# Start
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
