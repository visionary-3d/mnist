import { PerspectiveCamera } from "../../math/Camera";
import { Quaternion } from "../../math/Quaternion";
import { Vector3 } from "../../math/Vector3";

export class CameraStruct {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
  near: number;
  far: number;
  tanHalfFov: number;
  constructor(camera: PerspectiveCamera) {
    this.position = camera.position;
    this.quaternion = camera.quaternion;
    this.fov = camera.fov;
    this.near = camera.near;
    this.far = camera.far;
    this.tanHalfFov = Math.tan((Math.PI / 360) * this.fov);
  }

  copy(camera: PerspectiveCamera) {
    this.position.copy(camera.position);
    this.quaternion.copy(camera.quaternion);
    this.fov = camera.fov;
    this.near = camera.near;
    this.far = camera.far;
    this.tanHalfFov = Math.tan((Math.PI / 360) * this.fov);
  }
}
