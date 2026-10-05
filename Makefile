.PHONY: all engine test build-ui dev-ui clean clean-vst

all: test build-ui

engine:
	mkdir -p engine/build
	cd engine/build && cmake .. && cmake --build .

test: engine
	./engine/build/johnwalls_tests

dev-ui:
	cd ui && npm run dev

build-ui:
	cd ui && npm run build

clean:
	rm -rf engine/build ui/dist

clean-vst:
	rm -rf vst/build
