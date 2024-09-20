import Encoder from "./engine/Encoder";
import { DEBUG_INFO, useDebug } from "./engine/debug/debug";
import { useGpuDevice, useTick } from "./engine/init";
import { MnistDataset } from "./engine/libs/Mnist/data";
import Stats from "./engine/libs/Stats";
import { OperationManager } from "./engine/libs/Tensor/OperationManager";
import { TickData } from "./engine/render/controllers/tick-manager";
import { DisplayPass } from "./engine/render/passes/DisplayPass";

export const startApp = async () => {
  const mnist = await new MnistDataset().loadData();
  const { flatImages } = mnist.getTrainData();
  const device = useGpuDevice();

  const display = new DisplayPass(flatImages, mnist.getTrainDataSize());
  const displayStats = new Stats("Display").showPanel(2);
  const encoder = new Encoder(device, useDebug());

  const opm = new OperationManager();

  const t1 = opm.create(3, 3).randomIntUniform(42, 1, 4);
  const t2 = opm.create(3, 3).randomIntUniform(23, 1, 4);
  const t3 = opm.create(3, 3);

  await t1.print();
  await t2.print();

  opm.mul(t1, t2, t3);

  await t3.print();

  useTick(({ timestamp }: TickData) => {
    displayStats.begin();
    display.update(encoder, timestamp, DEBUG_INFO.FS_QUAD_RENDER_PASS);
    displayStats.end();

    encoder.submit(displayStats);
  });
};
