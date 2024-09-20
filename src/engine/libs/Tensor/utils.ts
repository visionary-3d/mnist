// only used for printing
export function transposeMatrixData(matrix: Float32Array, matrixWidth: number, matrixHeight: number): Float32Array {
  const transposedMatrix = new Float32Array(matrixWidth * matrixHeight);

  for (let i = 0; i < matrixHeight; i++) {
    for (let j = 0; j < matrixWidth; j++) {
      const originalIndex = i * matrixWidth + j;
      const transposedIndex = j * matrixHeight + i;
      transposedMatrix[transposedIndex] = matrix[originalIndex];
    }
  }

  return transposedMatrix;
}

// Pad to 16 byte chunks of 2, 4 (std140 layout)
export const pad2 = (n: number) => n + (n % 2);
export const pad4 = (n: number) => n + ((4 - (n % 4)) % 4);

export const nextPower2 = (n: number) => {
  const power = Math.ceil(Math.log2(n));
  // Return 2 raised to this power
  return Math.pow(2, power);
};
