# Using Devcontainers for Local Development

## Motivation

I have a lot of different projects that I work on both for school and
for work. I use a lot of different tools, and need a lot of things
running all of the time. I've been just installing packages globally
to accomdate this.

More and more, I've noticed that I end up losing track of what versions
I need for different projects, and because of this, I wanted to see if
there was a project level way to control what I had in my environment.

## What Devcontainers Do

Devcontainers use Docker to define a complete development environment,
including runtimes and tooling, inside a container. This means that I
can insulate my environment from the other parts of my system, and cut
down on the random packages that I've installed for any given project.

## Key Benefits

Even more benefits can come from using devcontainers to manage a
project, for example, if you commit your devcontainer setup to your
`git` repository, then any others who want to work on the project can
use that to ensure that everyone who is working on a project has the
same development environment which will ensure consistency across
setups.

## Drawbacks

In setting up devcontainers, there is an addititonal step of figuring
out what dependencies are needed for a given project and creating the
configuration file.

In one of the projects that I work on for work, I tried setting a
devcontainer up and found that I was having to restart and rebuild my
contiainer a bunch as I figured out what I needed to make it work the
way I wanted to.

Once you get everything installed and configured though, it seems to
work quite well. Just the initial headache of getting it setup was
annoying.

## Conclusion

In the end, I find devcontainers to be useful, and want to try using
them for future classes and projects. It will make it easier to keep
track of everything that I am using and make sure I don't have any
weird interactions that only happen on my system.
