import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecs_patterns from "@aws-cdk/aws-ecs-patterns";
import * as s3 from "@aws-cdk/aws-s3";
import * as sm from "@aws-cdk/aws-secretsmanager";
import * as sns from "@aws-cdk/aws-sns";
import { Port } from '@aws-cdk/aws-ec2';
import * as s3n from '@aws-cdk/aws-s3-notifications';
import { runInThisContext } from 'vm';

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // vpc
    const vpc = new ec2.Vpc(this, "FileUploadVpc", {
      maxAzs: 2 
    });

    // s3 bucket for file upload service 
    const fileUploadBucket = new s3.Bucket(this, 'fileUploadBucket', {
      versioned: true,
      bucketName: 'ulikabbq-file-uploader',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      metrics: [{
        id: "EntireBucket"
      }]
    })

    // s3 bucket for file upload service 
    const logstreamBucket = new s3.Bucket(this, 'logstreamBucket', {
      versioned: true,
      bucketName: 'ulikabbq-logstream',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    })

    const topic = new sns.Topic(this, 'FileUpload');
    fileUploadBucket.addEventNotification(s3.EventType.OBJECT_CREATED_PUT, new s3n.SnsDestination(topic));

    ////////////////////////
    // fargate cribl service
    //////////////////////// 
    // get the HEC token from Secrets Manager 
    const hecToken = sm.Secret.fromSecretAttributes(this, 'ImportedSecret', {
      secretCompleteArn: 'arn:aws:secretsmanager:us-east-1:433223883348:secret:hec-token-kmTvww'
    })

    const clusterCribl = new ecs.Cluster(this, "CriblCluster", {
      vpc: vpc
    });

    clusterCribl.addDefaultCloudMapNamespace({
      name: "cribl.loc"
    })

    // CW Logging
    const loggingCribl = new ecs.AwsLogDriver({
      streamPrefix: "cribl",
    })

    // Task Definition and Container Definition defined to set port 3000 and the bucket name as an env
    const taskDefCribl = new ecs.FargateTaskDefinition(this, 'taskDefCribl', {
      family: "cribl",
      memoryLimitMiB: 8192, 
      cpu: 4096,
    })

    const containerDefCribl = new ecs.ContainerDefinition(this, 'containerDefCribl', {
      taskDefinition: taskDefCribl,
      logging: loggingCribl,
      image: ecs.ContainerImage.fromRegistry("cribl/cribl:latest") ,
    })

    containerDefCribl.addPortMappings({
      containerPort: 9000
    })

    containerDefCribl.addPortMappings({
      containerPort: 8088
    })

    // Create a load-balanced Fargate service and make it public
    const fargateCribl = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "CriblFargateService", {
      cluster: clusterCribl,
      taskDefinition: taskDefCribl,
      listenerPort: 80, 
      publicLoadBalancer: true,
      cloudMapOptions: {
        name: "logstream"
      }
    });

    fargateCribl.targetGroup.configureHealthCheck({
      path: '/api/v1/health',
      port: '9000'
    })

    /////////////////////////////////
    // fargate file uploader service 
    /////////////////////////////////
    const cluster = new ecs.Cluster(this, "FileUploadCluster", {
      vpc: vpc
    });

    // Log to logstream
    const logstream = new ecs.SplunkLogDriver({
      url: 'http://logstream.cribl.loc:8088',
      token: hecToken.secretValue,
    }) 

    // Task Definition and Container Definition defined to set port 3000 and the bucket name as an env
    const taskDef = new ecs.FargateTaskDefinition(this, 'taskDef', {
      family: "file-uploader",
      memoryLimitMiB: 512, 
      cpu: 256,
    })

    const containerDef = new ecs.ContainerDefinition(this, 'containerDef', {
      taskDefinition: taskDef,
      logging: logstream,
      image: ecs.ContainerImage.fromAsset("../") ,
      environment: {
        "BUCKET_NAME":  fileUploadBucket.bucketName
      }
    })

    containerDef.addPortMappings({
      containerPort: 3000
    })

    // Create a load-balanced Fargate service and make it public
    const fargate = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "FileUploadFargateService", {
      cluster: cluster,
      taskDefinition: taskDef,
      listenerPort: 80, 
      publicLoadBalancer: true 
    });

    fargate.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '15');

    fargate.targetGroup.configureHealthCheck({
      path: '/health'
    })

    fileUploadBucket.grantReadWrite(fargate.taskDefinition.taskRole)
    logstreamBucket.grantReadWrite(fargateCribl.taskDefinition.taskRole)

    fargateCribl.service.connections.allowFrom(fargate.service, Port.tcp(8088), 'allow file uploader service')
    
    
  }
}
