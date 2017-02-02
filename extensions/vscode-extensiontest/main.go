package main

import "fmt"

func main() {
	x := 4
	doSomething(x)
}

func doSomething(number int) {
	fmt.Printf("%d\n", number)
}
