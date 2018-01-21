FROM node:9.2.0-wheezy
## CREATE APP USER ##
# Create the home directory for the new app user.
RUN mkdir -p /home/app
# Create an app user so our application doesn't run as root.
RUN groupadd -r app &&\
    useradd -r -g app -d /home/app -s /sbin/nologin -c "Docker image user" app
# Create app directory
ENV HOME=/home/app
ENV APP_HOME=/home/app/identity-srv
## SETTING UP THE APP ##
RUN mkdir $APP_HOME
WORKDIR $APP_HOME
RUN apt-get update && apt-get install -y libc6-dev
# Install app dependencies
RUN npm install -g typescript
# Set config volumes
VOLUME $APP_HOME/cfg
VOLUME $APP_HOME/protos
# Bundle app source
ADD . $APP_HOME
# Chown all the files to the app user.
RUN chown -R app:app $HOME
RUN cd $APP_HOME
RUN pwd
# Change to the app user.
USER app
RUN npm install

EXPOSE 50051
CMD [ "npm", "start" ]


#FROM node:9.2.0-wheezy
#RUN mkdir -p /home/app
#RUN groupadd -r app &&\
#    useradd -r -g app -d /home/app -s /sbin/nologin -c "Docker image user" app
#ENV HOME=/home/app
#ENV APP_HOME=/home/app/identity-srv
#RUN mkdir $APP_HOME
#WORKDIR $APP_HOME
#RUN pwd
# Copy files from base container by changing the ownership
#COPY --chown=app:app --from=base /home/app/identity-srv/ .
#USER app
#EXPOSE 50051
#CMD [ "npm", "start" ]

# To build the image:
# docker build -t restorecommerce/identity-srv .
#
# To create a container:
# docker create --name identity-srv --net restorecms_default restorecommerce/identity-srv
#
# To run the container:
# docker start identity-srv
