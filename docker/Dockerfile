FROM ubuntu:20.04

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update -y && apt update && apt-get install -y apt-utils

RUN apt-get -y install python3-pip && apt install -y python3-venv && \
apt-get install sudo -y &&  apt install -y git

RUN apt -y install nodejs && apt -y install npm
RUN npm install -g parcel-bundler

RUN git clone https://github.com/bquantump/satellite-tracker.git && cd satellite-tracker && \
npm install && npm update && parcel build index.html

RUN cp /satellite-tracker/helvetiker_bold.typeface.json /satellite-tracker/dist