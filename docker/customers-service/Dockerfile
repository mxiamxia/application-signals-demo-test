FROM openjdk:17-jre-slim

# Install AWS OTEL Java Agent
ADD https://github.com/aws-observability/aws-otel-java-instrumentation/releases/latest/download/aws-opentelemetry-agent.jar /opt/aws-opentelemetry-agent.jar
RUN chmod 644 /opt/aws-opentelemetry-agent.jar

VOLUME /tmp
ARG ARTIFACT_NAME
ARG EXPOSED_PORT
EXPOSE ${EXPOSED_PORT}

# CRITICAL: Add JVM memory and stack configuration to prevent StackOverflow
ENV JAVA_OPTS="-Xms512m -Xmx2048m -Xss2m -XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=512m -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:+UseStringDeduplication -XX:+OptimizeStringConcat -Djava.security.egd=file:/dev/./urandom"

# Add Hibernate-specific JVM options to prevent recursive query issues
ENV HIBERNATE_OPTS="-Dhibernate.max_fetch_depth=3 -Dhibernate.jdbc.batch_size=25 -Dhibernate.order_inserts=true -Dhibernate.order_updates=true"

# Add resilience and timeout configurations
ENV RESILIENCE_OPTS="-Dresilience4j.circuitbreaker.enabled=true -Dspring.cloud.loadbalancer.retry.enabled=true"

# Combine all JVM options
ENV COMBINED_OPTS="${JAVA_OPTS} ${HIBERNATE_OPTS} ${RESILIENCE_OPTS}"

ADD ${ARTIFACT_NAME}.jar /app.jar

# Use the combined JVM options in the entrypoint
ENTRYPOINT exec java ${COMBINED_OPTS} -javaagent:/opt/aws-opentelemetry-agent.jar -jar /app.jar