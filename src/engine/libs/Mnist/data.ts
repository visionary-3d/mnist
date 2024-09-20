import pako from "pako";

const BASE_URL = "http://127.0.0.1:8080/";
const TRAIN_IMAGES_FILE = "train-images-idx3-ubyte";
const TRAIN_LABELS_FILE = "train-labels-idx1-ubyte";
const TEST_IMAGES_FILE = "t10k-images-idx3-ubyte";
const TEST_LABELS_FILE = "t10k-labels-idx1-ubyte";
const IMAGE_HEADER_MAGIC_NUM = 2051;
const IMAGE_HEADER_BYTES = 16;
const IMAGE_HEIGHT = 28;
const IMAGE_WIDTH = 28;
const IMAGE_FLAT_SIZE = IMAGE_HEIGHT * IMAGE_WIDTH;
const LABEL_HEADER_MAGIC_NUM = 2049;
const LABEL_HEADER_BYTES = 8;
const LABEL_RECORD_BYTE = 1;
const LABEL_FLAT_SIZE = 10;

async function fetchAndDecompress(url: string) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const gunzip = pako.ungzip(uint8Array);
  return gunzip;
}

function loadHeaderValues(buffer: Uint8Array, headerLength: number) {
  const headerValues: number[] = [];
  for (let i = 0; i < headerLength / 4; i++) {
    headerValues[i] = (buffer[i * 4] << 24) | (buffer[i * 4 + 1] << 16) | (buffer[i * 4 + 2] << 8) | buffer[i * 4 + 3];
  }
  return headerValues;
}

async function loadImages(filename: string) {
  const buffer = await fetchAndDecompress(`${BASE_URL}${filename}.gz`);
  const headerBytes = IMAGE_HEADER_BYTES;
  const recordBytes = IMAGE_HEIGHT * IMAGE_WIDTH;

  const headerValues = loadHeaderValues(buffer, headerBytes);
  if (
    headerValues[0] !== IMAGE_HEADER_MAGIC_NUM ||
    headerValues[2] !== IMAGE_HEIGHT ||
    headerValues[3] !== IMAGE_WIDTH
  ) {
    throw new Error("Invalid image file header");
  }

  const images: Float32Array[] = [];
  let index = headerBytes;
  while (index < buffer.length) {
    const array = new Float32Array(recordBytes);
    for (let i = 0; i < recordBytes; i++) {
      array[i] = buffer[index++] / 255;
    }
    images.push(array);
  }

  if (images.length !== headerValues[1]) {
    throw new Error("Mismatch in the number of images");
  }
  return images;
}

async function loadLabels(filename: string) {
  const buffer = await fetchAndDecompress(`${BASE_URL}${filename}.gz`);
  const headerBytes = LABEL_HEADER_BYTES;
  const recordBytes = LABEL_RECORD_BYTE;

  const headerValues = loadHeaderValues(buffer, headerBytes);
  if (headerValues[0] !== LABEL_HEADER_MAGIC_NUM) {
    throw new Error("Invalid label file header");
  }

  const labels: Int32Array[] = [];
  let index = headerBytes;
  while (index < buffer.length) {
    const array = new Int32Array(recordBytes);
    for (let i = 0; i < recordBytes; i++) {
      array[i] = buffer[index++];
    }
    labels.push(array);
  }

  if (labels.length !== headerValues[1]) {
    throw new Error("Mismatch in the number of labels");
  }
  return labels;
}

export class MnistDataset {
  trainSize?: number;
  testSize?: number;
  trainBatchIndex: number;
  testBatchIndex: number;
  dataset?: [Float32Array[], Int32Array[], Float32Array[], Int32Array[]];
  constructor() {
    this.trainBatchIndex = 0;
    this.testBatchIndex = 0;
  }

  async loadData() {
    this.dataset = await Promise.all([
      loadImages(TRAIN_IMAGES_FILE),
      loadLabels(TRAIN_LABELS_FILE),
      loadImages(TEST_IMAGES_FILE),
      loadLabels(TEST_LABELS_FILE),
    ]);

    this.trainSize = this.dataset[0].length;
    this.testSize = this.dataset[2].length;

    return this;
  }

  getTrainData() {
    return this.getData(true);
  }

  getTestData() {
    return this.getData(false);
  }

  getTrainDataSize() {
    return this.getDataSize(true);
  }

  getTestDataSize() {
    return this.getDataSize(false);
  }

  private getData(isTrainingData: boolean) {
    if (!this.dataset) return { flatImages: new Float32Array(), labels: new Int32Array() };

    let imagesIndex;
    let labelsIndex;
    if (isTrainingData) {
      imagesIndex = 0;
      labelsIndex = 1;
    } else {
      imagesIndex = 2;
      labelsIndex = 3;
    }
    const size = this.getDataSize();

    // const imagesShape = [size, IMAGE_HEIGHT, IMAGE_WIDTH, 1] as any;
    const flatImages = new Float32Array(size * IMAGE_FLAT_SIZE);
    const labels = new Int32Array(size);

    let imageOffset = 0;
    let labelOffset = 0;
    for (let i = 0; i < size; ++i) {
      flatImages.set(this.dataset[imagesIndex][i], imageOffset);
      labels.set(this.dataset[labelsIndex][i], labelOffset);
      imageOffset += IMAGE_FLAT_SIZE;
      labelOffset += 1;
    }

    return { flatImages, labels };
  }

  private getDataSize(isTrainingData?: boolean) {
    if (!this.dataset) return 0;

    let imagesIndex;

    if (isTrainingData) {
      imagesIndex = 0;
    } else {
      imagesIndex = 2;
    }

    // divide by 2 because of the buffer creation limit
    return this.dataset[imagesIndex].length / 2;
  }
}
