#version 300 es
precision highp float;

#include <definitions>

in vec3 position;
in vec3 normal;
in vec4 tangent;
in vec2 uv;
in float meshInfoIndex;
in float materialIndex;

uniform mat4 meshInfos[MESH_COUNT];
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

void main() {
	mat4 meshInfo = meshInfos[int(meshInfoIndex)];
	mat4 transform = meshInfo;
	transform[0][3] = 0.0;
	transform[1][3] = 0.0;
	transform[2][3] = 0.0;
	transform[3][3] = 1.0;
	float opacity = meshInfo[0][3];

	if (opacity < 1.0) {
		gl_Position = vec4(0.0);
		return;
	}

	vec4 transformed = transform * vec4(position, 1.0);
	transformed = viewMatrix * transformed;
	transformed = projectionMatrix * transformed;
	gl_Position = transformed;
}