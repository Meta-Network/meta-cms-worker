import OS from 'os';

export type CPUInfo = {
  user: number;
  sys: number;
  idle: number;
  total: number;
};

export class CPUUtils {
  private cpuInfo1: CPUInfo = {
    user: 0,
    sys: 0,
    idle: 0,
    total: 0,
  };
  private cpuInfo2: CPUInfo = {
    user: 0,
    sys: 0,
    idle: 0,
    total: 0,
  };

  public getCPUUsage(): string {
    this.cpuInfo1 = this.cpuInfo2; // Swap info
    this.cpuInfo2 = this.getCPUInfo(); // Get new CPU info

    const idle = this.cpuInfo2.idle - this.cpuInfo1.idle;
    const total = this.cpuInfo2.total - this.cpuInfo1.total;
    const usage = 1 - idle / total;
    const percentage = `${(usage * 100.0).toFixed(2)}%`;
    return percentage;
  }

  private getCPUInfo(): CPUInfo {
    const cpus = OS.cpus();
    let user = 0,
      nice = 0,
      sys = 0,
      idle = 0,
      irq = 0,
      total = 0;

    for (const cpu in cpus) {
      const times = cpus[cpu].times;
      user += times.user;
      nice += times.nice;
      sys += times.sys;
      idle += times.idle;
      irq += times.irq;
    }

    total += user + nice + sys + idle + irq;

    return {
      user,
      sys,
      idle,
      total,
    };
  }
}
