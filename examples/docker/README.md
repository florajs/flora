# Flora Example

## Run as Container

```
$ docker build -t flora-example .
$ docker run --rm -p 8000:8000 -it flora-example

$ open http://localhost:8000/user/
```

## Request using @florajs/ql

* List: [/user/](http://localhost:8000/user/)
* Retrieve: [/user/1001](http://localhost:8000/user/1001)
* Select attributes: [/user/?select=firstname,lastname](http://localhost:8000/user/?select=firstname,lastname)
* Filter users: [/user/?filter=domain="internal"](http://localhost:8000/user/?filter=domain="internal")
* Order by lastname: [/user/?order=lastname:asc](http://localhost:8000/user/?order=lastname:asc)
