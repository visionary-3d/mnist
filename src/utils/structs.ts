import { useGui } from "../engine/init";

export class Value<T> {
  value: T;

  constructor(value: T, name?: string) {
    this.value = value;

    if (name) {
      const gui = useGui();
      gui.add(this, "value").name(name);
    }
  }

  get() {
    return this.value;
  }

  set(value: T) {
    this.value = value;
  }
}
