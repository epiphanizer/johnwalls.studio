.PHONY: all engine test ui build-all clean dev

all: test build-ui

engine:
	mkdir -p engine/build
	cd engine/build && cmake .. && cmake --build .

test: engine
	./engine/build/pedalboard_tests

dev-ui:
	cd ui && npm run dev

build-ui:
	cd ui && npm run build

clean:
	rm -rf engine/build ui/dist
