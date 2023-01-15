terraform {
    backend "remote" {
        organization = "mountainpass"
  
        workspaces {
            prefix = "addressr-"
        }
    }
    required_providers {
        aws = {
          source = "hashicorp/aws"
        }
        google = {
          source = "hashicorp/google"
        }
      }
      required_version = ">= 0.13"
}
