terraform {
  backend "remote" {
    organization = "mountainpass"

    workspaces {
      prefix = "addressr-"
    }
  }
}
