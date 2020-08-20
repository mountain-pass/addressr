# resource "digitalocean_kubernetes_cluster" "addressr" {
#   name    = "addressr"
#   region  = "sfo2"
#   # Grab the latest version slug from `doctl kubernetes options versions`
#   version = "1.18.3-do.0"

#   node_pool {
#     name       = "api-pool"
#     size       = "s-1vcpu-2gb"
#     auto_scale = true
#     min_nodes  = 1
#     max_nodes  = 5
#   }

#   tags = ["addressr"]

#   # node_pool {
#   #   name       = "es-pool"
#   #   size       = "s-2vcpu-2gb"
#   #   auto_scale = true
#   #   min_nodes  = 1
#   #   max_nodes  = 5
#   # }

# }

# # resource "digitalocean_kubernetes_node_pool" "loader" {
# #   cluster_id = digitalocean_kubernetes_cluster.addressr.id

# #   name       = "loader-pool"
# #   size       = "s-4vcpu-8gb"
# #   auto_scale = true
# #   min_nodes  = 0
# #   max_nodes  = 2
# #   tags       = ["loader"]

# #   labels = {
# #     service  = "loader"
# #     priority = "high"
# #   }
# # }

# provider "kubernetes" {
#   version = "~> 1.11"
#   load_config_file = false
#   host  = digitalocean_kubernetes_cluster.addressr.endpoint
#   token = digitalocean_kubernetes_cluster.addressr.kube_config[0].token
#   cluster_ca_certificate = base64decode(
#     digitalocean_kubernetes_cluster.addressr.kube_config[0].cluster_ca_certificate
#   )
# }

# provider "helm" {
#   version = "~> 1.2"
#   kubernetes {
#     host     = digitalocean_kubernetes_cluster.addressr.endpoint
#     load_config_file = false
#     token = digitalocean_kubernetes_cluster.addressr.kube_config[0].token
#     cluster_ca_certificate = base64decode(
#       digitalocean_kubernetes_cluster.addressr.kube_config[0].cluster_ca_certificate
#     )
#   }
# }

# data "helm_repository" "elastic" {
#   name = "elastic"
#   url  = "https://helm.elastic.co"
# }

# resource "helm_release" "elasticsearch" {
#   chart      = "elasticsearch"
#   repository = data.helm_repository.elastic.metadata[0].url
#   name       = "elasticsearch"
#   version    = "7.7.1"
#   dependency_update = true
#   verify     = true
#   wait       = true

#   set {
#     name  = "master.persistence.storageClass"
#     value = "default"
#   }

#   set {
#     name  = "master.persistence.size"
#     value = "4Gi"
#   }

#   set {
#     name  = "data.persistence.storageClass"
#     value = "default"
#   }

#   set {
#     name  = "data.persistence.size"
#     value = "31Gi"
#   }
# }


provider "aws" {
  # ... other configuration ...

  version    = "~> 2.17"
  region     = "ap-southeast-2"
  access_key = "${AWS_ACCESS_KEY_ID}"
  secret_key = "${AWS_SECRET_ACCESS_KEY}"
}

resource "aws_elasticsearch_domain" "addressr" {
  domain_name           = "addressr-${TF_WS}"
  elasticsearch_version = "7.4"

  cluster_config {
    instance_type  = "t2.small.elasticsearch"
    instance_count = 1
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "standard"
    volume_size = 10
  }

  snapshot_options {
    automated_snapshot_start_hour = 14
  }

  node_to_node_encryption {
    enabled = true
  }

  tags = {
    env = "${TF_WS}"
  }
}

output "ELASTIC" { value = aws_elasticsearch_domain.addressr.endpoint }

resource "aws_ecs_cluster" "addressr" {
  name = "addressr-${TF_WS}"
}

locals {
  XXX = "9200"
}

resource "aws_ecs_task_definition" "addressr-server" {
  family = "addressr-server"
  container_definitions = jsonencode([
    {
      "name" : "addressr",
      "logConfiguration" : {
        "logDriver" : "awslogs",
        "options" : {
          "awslogs-group" : "/ecs/addressr-server",
          "awslogs-region" : "ap-southeast-2",
          "awslogs-stream-prefix" : "ecs"
        }
      },
      "portMappings" : [
        {
          "hostPort" : 8080,
          "protocol" : "tcp",
          "containerPort" : 8080
        }
      ],
      "command" : ["addressr-server"],
      "cpu" : 0,
      "image" : "mountainpass/addressr:1.0.13",
      "healthCheck" : {
        "command" : ["curl -i http://localhost:8080/"],
        "interval" : 30,
        "retries" : 3,
        "timeout" : 5
      },
      "essential" : true,
      "environment" : [
        {
          "name" : "ELASTIC_HOST",
          "value" : aws_elasticsearch_domain.addressr.endpoint
        },
        {
          "name" : "ELASTIC_PORT",
          "value" : "443"
        }
      ],
      "mountPoints" : [],
      "volumesFrom" : []
    }
    ]
  )
  execution_role_arn       = "arn:aws:iam::869772437473:role/ecsTaskExecutionRole"
  memory                   = 1024
  cpu                      = 256
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"

  tags = {
    env = "${TF_WS}"
  }
}

resource "aws_ecs_service" "addressr-server" {
  name            = "addressr-server"
  cluster         = "${aws_ecs_cluster.addressr.id}"
  task_definition = "${aws_ecs_task_definition.addressr-server.arn}"
  desired_count   = 1
  launch_type     = "FARGATE"
  # iam_role        = "${aws_iam_role.foo.arn}"
  # depends_on      = ["aws_iam_role_policy.foo"]

  # load_balancer {
  #   target_group_arn = "${aws_lb_target_group.foo.arn}"
  #   container_name   = "mongo"
  #   container_port   = 8080
  # }

  # placement_constraints {
  #   type       = "memberOf"
  #   expression = "attribute:ecs.availability-zone in [us-west-2a, us-west-2b]"
  # }

  network_configuration {
    subnets          = ["subnet-0f017540d8b31d534"]
    assign_public_ip = false
  }
}
