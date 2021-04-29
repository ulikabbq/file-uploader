import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecs_patterns from "@aws-cdk/aws-ecs-patterns";
import * as s3 from "@aws-cdk/aws-s3";

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // vpc
    const vpc = new ec2.Vpc(this, "FileUploadVpc", {
      maxAzs: 2 
    });

    // s3 bucket 
    const fileUploadBucket = new s3.Bucket(this, 'fileUploadBucket', {
      versioned: true,
      bucketName: 'ulikabbq-file-uploader',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      metrics: [{
        id: "EntireBucket"
      }]
    })

    // fargate service 
    const cluster = new ecs.Cluster(this, "FileUploadCluster", {
      vpc: vpc
    });

    // CW Logging
    const logging = new ecs.AwsLogDriver({
      streamPrefix: "file-uploader",
    })

    // Task Definition and Container Definition defined to set port 3000 and the bucket name as an env
    const taskDef = new ecs.FargateTaskDefinition(this, 'taskDef', {
      family: "file-uploader",
      memoryLimitMiB: 512, 
      cpu: 256,
    })

    const containerDef = new ecs.ContainerDefinition(this, 'containerDef', {
      taskDefinition: taskDef,
      logging: logging,
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

    fargate.targetGroup.configureHealthCheck({
      path: '/health'
    })

    fileUploadBucket.grantReadWrite(fargate.taskDefinition.taskRole)

  }
}
