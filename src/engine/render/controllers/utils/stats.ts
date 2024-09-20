class Panel {
  private container: HTMLDivElement;
  private msElement: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private maxDataPoints: number;
  private maxData: number = 0;
  private barWidth: number;
  public averageMilliseconds: number = 0;
  public label: string;

  constructor(label: string, maxDataPoints: number = 600) {
    this.label = label;
    this.container = document.createElement('div');
    this.container.style.position = 'absolute';
    this.container.style.bottom = '0';
    this.container.style.left = '0';
    this.container.style.background = 'rgba(0, 0, 0, 0.8)';
    this.container.style.color = '#fff';
    this.container.style.fontFamily = 'Arial';
    this.container.style.justifyContent = 'center';
    this.container.style.alignItems = 'center';

    this.msElement = document.createElement('div');
    this.msElement.style.margin = '5px';
    this.msElement.style.fontSize = '12px';

    this.canvas = document.createElement('canvas');
    this.canvas.width = 100;
    this.canvas.height = 30;
    this.canvas.style.position = 'relative';
    this.canvas.style.background = '#000';
    this.ctx = this.canvas.getContext('2d')!;

    this.container.appendChild(this.msElement);
    this.container.appendChild(this.canvas);

    document.body.appendChild(this.container);

    this.maxDataPoints = maxDataPoints;
    this.barWidth = this.canvas.width / this.maxDataPoints;
  }

  public updateMilliseconds(milliseconds: Float32Array, currentIndex: number): void {
    this.averageMilliseconds = this.calculateAverage(milliseconds, currentIndex);
    this.msElement.textContent = this.label + ' :: ' + this.averageMilliseconds.toFixed(4);
  }

  public drawGraph(data: Float32Array, currentIndex: number): void {
    this.updateMilliseconds(data, currentIndex)
    
    const dataMax = Math.max(...data)
    const max = Math.max(dataMax, this.maxData);

    this.maxData = max;
    const graphHeight = this.canvas.height;

    // this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = '#010313';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = '#f41f3b';

    for (let i = 0; i < this.maxDataPoints; i++) {
      const barHeight = (data[i] / this.maxData) * graphHeight;
      const x = i * this.barWidth;
      const y = this.canvas.height - barHeight;

      this.ctx.fillRect(x, y, this.barWidth - 1, barHeight);
    }
  }

  private calculateAverage(data: Float32Array, currentIndex: number): number {
    let sum = 0;
    let count = 0;

    let dataIndex = currentIndex;
    for (let i = 0; i < this.maxDataPoints; i++) {
      sum += data[dataIndex];
      count++;

      dataIndex = (dataIndex + 1) % data.length;
    }

    return sum / count;
  }
}
class Stats {
  private startTime: number = 0;
  private endTime: number = 0;
  private latencyArray: Float32Array;
  private currentIndex: number = 0;
  public fps: number = 0;
  public latency: number = 0;
  public panel: Panel;

  constructor(label: string) {
    // Number of data points for the past 10 seconds
    const maxDataPoints = Math.ceil(600); 
    this.panel = new Panel(label, maxDataPoints);
    this.latencyArray = new Float32Array(maxDataPoints);
  }

  public begin() {
    this.startTime = performance.now();
  }

  public end() {
    this.endTime = performance.now();
    const milliseconds = this.endTime - this.startTime;

    this.latency = milliseconds;

    this.latencyArray[this.currentIndex] = this.latency;
    this.currentIndex = (this.currentIndex + 1) % this.latencyArray.length;
    this.panel.drawGraph(this.latencyArray, this.currentIndex);
  }
}

export default Stats;
