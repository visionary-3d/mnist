import { Matrix4 } from './Matrix4';
import { Object3D } from './Object3D';
import { Vector3 } from './Vector3';

export class Camera extends Object3D {
  matrixWorldInverse: Matrix4;
  projectionMatrix: Matrix4;
  projectionMatrixInverse: Matrix4;

  constructor() {
    super();
    this.matrixWorldInverse = new Matrix4();
    this.projectionMatrix = new Matrix4();
    this.projectionMatrixInverse = new Matrix4();
  }

  copy(source: Camera, recursive?: boolean): this {
    super.copy(source, recursive);
    this.matrixWorldInverse.copy(source.matrixWorldInverse);
    this.projectionMatrix.copy(source.projectionMatrix);
    this.projectionMatrixInverse.copy(source.projectionMatrixInverse);
    return this;
  }

  getWorldDirection(target: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);
    const e = this.matrixWorld.elements;
    return target.set(-e[8], -e[9], -e[10]).normalize();
  }

  updateMatrixWorld(force?: boolean): void {
    super.updateMatrixWorld(force);
    this.matrixWorldInverse.copy(this.matrixWorld).invert();
  }

  updateWorldMatrix(
    updateParents?: boolean,
    updateChildren?: boolean
  ): void {
    super.updateWorldMatrix(updateParents, updateChildren);
    this.matrixWorldInverse.copy(this.matrixWorld).invert();
  }

  equals(camera: Camera): boolean {
    return (
      this.position.equals(camera.position) &&
      this.quaternion.equals(camera.quaternion) &&
      this.scale.equals(camera.scale) &&
      this.matrixWorld.equals(camera.matrixWorld) &&
      this.projectionMatrix.equals(camera.projectionMatrix) &&
      this.projectionMatrixInverse.equals(camera.projectionMatrixInverse)
    );
  } 

  clone(recursive?: boolean): Object3D {
    return new Camera().copy(this, recursive);
  }
}

export class PerspectiveCamera extends Camera {
  viewMatrix: Matrix4;
  fov: number;
  aspectRatio: number;
  far: number;
  near: number;

  constructor(fov: number, aspectRatio: number, near: number, far: number) {
    super();
    this.fov = fov;
    this.aspectRatio = aspectRatio;
    this.near = near;
    this.far = far;
    this.viewMatrix = new Matrix4();
    this.projectionMatrix = new Matrix4();
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    this.projectionMatrix.identity();
    const projectionElements = this.projectionMatrix.elements;
    const tanHalfFov = Math.tan(this.fov * 0.5);
    projectionElements[0] = 1 / (this.aspectRatio * tanHalfFov);
    projectionElements[5] = 1 / tanHalfFov;
    projectionElements[10] = -(this.far + this.near) / (this.far - this.near);
    projectionElements[11] = -1;
    projectionElements[14] =
      -(2 * this.far * this.near) / (this.far - this.near);
    projectionElements[15] = 0;
  }

  copy(camera: PerspectiveCamera, recursive?: boolean) {
    super.copy(camera, recursive);

    this.fov = camera.fov;
    this.aspectRatio = camera.aspectRatio;
    this.near = camera.near;
    this.far = camera.far;

    return this;
  }

  equals(camera: PerspectiveCamera) {
    const e = super.equals(camera);
    return (
      e &&
      this.aspectRatio === camera.aspectRatio &&
      this.fov === camera.fov &&
      this.near === camera.near &&
      this.far === camera.far
    );
  }

  clone() {
    return new PerspectiveCamera(this.fov, this.aspectRatio, this.near, this.far).copy(this);
  }
}
