#!/bin/bash

docker network create --driver bridge testing_net
docker run --name identity_zk -d --net=testing_net -p 2181:2181 zookeeper:3.5.5
docker run --name identity_kafka -d --net=testing_net -p 29092:29092 -e KAFKA_CFG_LISTENERS=PLAINTEXT://:29092 -e KAFKA_CFG_ADVERTISED_LISTENERS=PLAINTEXT://localhost:29092 -e ALLOW_PLAINTEXT_LISTENER=yes -e KAFKA_CFG_ZOOKEEPER_CONNECT=zk:2181 -e KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE=true -e KAFKA_CFG_DELETE_TOPIC_ENABLE=true -v /var/run/docker.sock:/var/run/docker.sock --link identity_zk:zk bitnami/kafka:2.3.1
docker run --name identity_redis -d --net=testing_net -p 127.0.0.1:6379:6379  redis:5.0.3-alpine
docker run --name identity_adb -d -p 127.0.0.1:8529:8529 -e ARANGO_NO_AUTH=1 arangodb/arangodb:3.4.7
sleep 10
docker ps -a
docker logs identity_adb
docker logs identity_zk
docker logs identity_kafka
docker logs identity_redis
