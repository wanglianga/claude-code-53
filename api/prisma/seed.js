// 种子数据：幂等（已有用户则跳过）。日期均相对启动当天，保证演示数据始终“新鲜”。
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

function d(days, hour = 9, min = 0) {
  const t = new Date();
  t.setDate(t.getDate() + days);
  t.setHours(hour, min, 0, 0);
  return t;
}
function months(base, n) {
  const t = new Date(base);
  t.setMonth(t.getMonth() + n);
  return t;
}

async function main() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log('[seed] 已存在数据，跳过');
    return;
  }
  console.log('[seed] 初始化演示数据...');
  const hash = (p) => bcrypt.hashSync(p, 10);

  // ---------- 用户（角色：管理员/医生/护士/前台/财务/技工所） ----------
  const admin = await prisma.user.create({ data: { username: 'admin', password: hash('admin123'), name: '系统管理员', role: 'ADMIN' } });
  const drWang = await prisma.user.create({ data: { username: 'dr.wang', password: hash('doctor123'), name: '王正畸', role: 'DOCTOR' } });
  const drLi = await prisma.user.create({ data: { username: 'dr.li', password: hash('doctor123'), name: '李早矫', role: 'DOCTOR' } });
  const nurse = await prisma.user.create({ data: { username: 'nurse.chen', password: hash('nurse123'), name: '陈护士', role: 'NURSE' } });
  const front = await prisma.user.create({ data: { username: 'front.zhao', password: hash('recept123'), name: '赵前台', role: 'RECEPTION' } });
  const fin = await prisma.user.create({ data: { username: 'fin.sun', password: hash('finance123'), name: '孙财务', role: 'FINANCE' } });
  const lab = await prisma.user.create({ data: { username: 'lab.zhou', password: hash('lab123'), name: '周技工', role: 'LAB' } });

  // ---------- 椅位 ----------
  const chairs = [];
  for (const name of ['椅位 A1', '椅位 A2', '椅位 B1', '椅位 B2']) {
    chairs.push(await prisma.chair.create({ data: { name } }));
  }

  // ---------- 医生出诊排班 ----------
  const schedules = [];
  for (let wd = 1; wd <= 5; wd++) {
    schedules.push({ doctorId: drWang.id, weekday: wd, startMin: 540, endMin: 720 });   // 09:00-12:00
    schedules.push({ doctorId: drWang.id, weekday: wd, startMin: 810, endMin: 1050 });  // 13:30-17:30
  }
  schedules.push({ doctorId: drWang.id, weekday: 6, startMin: 540, endMin: 720 }); // 周六上午
  for (const wd of [1, 3, 5]) {
    schedules.push({ doctorId: drLi.id, weekday: wd, startMin: 540, endMin: 720 });
    schedules.push({ doctorId: drLi.id, weekday: wd, startMin: 810, endMin: 1050 });
  }
  for (const wd of [2, 4]) {
    schedules.push({ doctorId: drLi.id, weekday: wd, startMin: 810, endMin: 1050 });
  }
  await prisma.doctorSchedule.createMany({ data: schedules });

  // ---------- 患者 1：林小满（隐形矫治，在治，含逾期费用） ----------
  const p1 = await prisma.patient.create({
    data: {
      mrn: 'P20260001', name: '林小满', gender: '女', birthDate: new Date('2002-03-18'),
      phone: '13800000001', perioStatus: '牙龈轻度炎症，探诊少量出血，口腔卫生一般，已行洁治。',
      allergy: '无', note: '患者上班族，偏好工作日晚间及周六上午复诊。',
      primaryDoctorId: drWang.id,
    },
  });
  const plan1Start = d(-120);
  const plan1 = await prisma.treatmentPlan.create({
    data: {
      patientId: p1.id, doctorId: drWang.id, type: 'INVISIBLE', version: 1,
      totalAligners: 40, currentAligner: 12, alignerDays: 10, revisitWeeks: 10,
      attachments: [{ tooth: '14', note: '矩形附件' }, { tooth: '24', note: '矩形附件' }, { tooth: '36', note: '优化附件' }],
      extractions: [],
      ipr: [{ tooth: '31', mm: 0.3 }, { tooth: '41', mm: 0.3 }],
      expectedMonths: 18, totalFee: 42000, startDate: plan1Start, expectedEnd: months(plan1Start, 18),
      note: '安氏 II 类，牙列拥挤，隐形矫治，先排齐再内收。',
    },
  });
  const p1Stages = [];
  for (let i = 0; i < 4; i++) {
    p1Stages.push(await prisma.treatmentStage.create({
      data: {
        planId: plan1.id, seq: i + 1, name: `第 ${i + 1} 阶段（第 ${i * 10 + 1}-${i * 10 + 10} 副）`,
        alignerFrom: i * 10 + 1, alignerTo: i * 10 + 10, status: i === 0 ? 'DONE' : 'ACTIVE',
      },
    }));
  }
  await prisma.paymentStage.createMany({
    data: [
      { patientId: p1.id, planId: plan1.id, stageId: p1Stages[0].id, name: '首期（方案设计费）', seq: 1, amount: 12000, dueDate: d(-118), status: 'PAID', paidAt: d(-118), method: '扫码', operatorId: fin.id },
      { patientId: p1.id, planId: plan1.id, stageId: p1Stages[0].id, name: '第二期（第 1-10 副）', seq: 2, amount: 10000, dueDate: d(-60), status: 'PAID', paidAt: d(-62), method: '刷卡', operatorId: fin.id },
      { patientId: p1.id, planId: plan1.id, stageId: p1Stages[1].id, name: '第三期（第 11-20 副）', seq: 3, amount: 10000, dueDate: d(-5), status: 'PENDING' },
      { patientId: p1.id, planId: plan1.id, name: '尾款（含保持器）', seq: 4, amount: 10000, dueDate: d(90), status: 'PENDING' },
    ],
  });
  // 影像：口扫 v1/v2、面像、全景片
  await prisma.imagingRecord.createMany({
    data: [
      { patientId: p1.id, planId: plan1.id, stageId: p1Stages[0].id, type: 'ORAL_SCAN', version: 1, note: '初诊口扫（外院 U 盘拷贝，仅登记）', takenAt: d(-120), uploadedBy: nurse.id },
      { patientId: p1.id, planId: plan1.id, stageId: p1Stages[0].id, type: 'FACIAL_PHOTO', version: 1, note: '初诊面像三连拍', takenAt: d(-120), uploadedBy: nurse.id },
      { patientId: p1.id, planId: plan1.id, stageId: p1Stages[0].id, type: 'XRAY_PANO', version: 1, note: '全景片：38、48 阻生', takenAt: d(-119), uploadedBy: nurse.id },
      { patientId: p1.id, planId: plan1.id, stageId: p1Stages[1].id, type: 'ORAL_SCAN', version: 2, note: '阶段复核口扫（第 10 副结束）', takenAt: d(-30), uploadedBy: nurse.id },
    ],
  });
  // 已完成的一次复诊（20 天前）
  const apptPast = await prisma.appointment.create({
    data: {
      patientId: p1.id, planId: plan1.id, stageId: p1Stages[1].id, doctorId: drWang.id, chairId: chairs[0].id,
      startAt: d(-20, 10, 0), endAt: d(-20, 10, 30), type: '复诊', status: 'COMPLETED',
    },
  });
  const visitPast = await prisma.visitRecord.create({
    data: {
      appointmentId: apptPast.id, patientId: p1.id, planId: plan1.id, stageId: p1Stages[1].id,
      wearHours: 20, hygiene: 'FAIR', attachmentLost: 1, alignerLost: false, painLevel: 2,
      discomfort: '第 11 副初戴前两天有酸胀感。', paymentChecked: true, nurseNote: '36 附件脱落 1 颗，已告知勿用力摘戴。',
      nurseId: nurse.id, nurseAt: d(-20, 10, 5),
      movementOk: true, conclusion: '牙列排齐进度符合预期，36 附件已重新粘接。', advanceAligner: true,
      restart: false, needImaging: false, doctorAdvice: '每日佩戴不少于 20 小时，饭后清洁牙套。',
      doctorId: drWang.id, doctorAt: d(-20, 10, 25),
    },
  });
  await prisma.materialUsage.create({
    data: { visitId: visitPast.id, stageId: p1Stages[1].id, name: '附件粘接树脂', qty: 1, unit: '颗' },
  });
  // 今天的预约（供演示护士→医生流程）
  await prisma.appointment.create({
    data: {
      patientId: p1.id, planId: plan1.id, stageId: p1Stages[1].id, doctorId: drWang.id, chairId: chairs[0].id,
      startAt: d(0, 10, 0), endAt: d(0, 10, 30), type: '复诊', status: 'SCHEDULED', note: '患者希望尽量上午',
    },
  });
  // 技工所批次（第 13-24 副已发货）
  await prisma.labOrder.create({
    data: {
      patientId: p1.id, planId: plan1.id, stageId: p1Stages[1].id, type: 'ALIGNER_BATCH',
      alignerFrom: 13, alignerTo: 24, labName: '精工齿科技工所', trackingNo: 'SF1380000123',
      status: 'SHIPPED', requestedBy: nurse.id, requestedAt: d(-14), shippedAt: d(-10),
    },
  });
  // 历史异常：患者临时延期（已解决，延误 7 天）
  await prisma.exceptionCase.create({
    data: {
      patientId: p1.id, planId: plan1.id, stageId: p1Stages[0].id, type: 'PATIENT_DELAY', status: 'RESOLVED',
      title: '患者临时延期复诊', detail: '患者出差，复诊由原计划顺延 7 天。', impactDays: 7,
      createdBy: front.id, resolution: '已改期并完成复诊。', createdAt: d(-75), resolvedAt: d(-68),
      tasks: { create: [{ assigneeRole: 'RECEPTION', note: '联系患者改期', done: true, doneAt: d(-68), doneBy: front.id }] },
    },
  });

  // ---------- 患者 2：张皓（固定托槽，附件反复脱落异常） ----------
  const p2 = await prisma.patient.create({
    data: {
      mrn: 'P20260002', name: '张皓', gender: '男', birthDate: new Date('2011-06-02'),
      phone: '13800000002', perioStatus: '牙周健康，口腔卫生需加强（正畸中）。',
      primaryDoctorId: drWang.id, note: '学生，复诊需家长陪同。',
    },
  });
  const plan2Start = d(-90);
  const plan2 = await prisma.treatmentPlan.create({
    data: {
      patientId: p2.id, doctorId: drWang.id, type: 'FIXED', version: 1,
      revisitWeeks: 5, expectedMonths: 24, totalFee: 26000, startDate: plan2Start, expectedEnd: months(plan2Start, 24),
      extractions: [{ tooth: '14', done: true }, { tooth: '24', done: true }],
      attachments: [], ipr: [],
      note: '拔牙矫治（14、24 已拔除），金属自锁托槽。',
    },
  });
  const p2Stage = await prisma.treatmentStage.create({
    data: { planId: plan2.id, seq: 1, name: '主治疗阶段（排齐内收）', status: 'ACTIVE' },
  });
  await prisma.paymentStage.createMany({
    data: [
      { patientId: p2.id, planId: plan2.id, stageId: p2Stage.id, name: '首期', seq: 1, amount: 10000, dueDate: d(-88), status: 'PAID', paidAt: d(-88), method: '扫码', operatorId: fin.id },
      { patientId: p2.id, planId: plan2.id, stageId: p2Stage.id, name: '中期', seq: 2, amount: 8000, dueDate: d(-30), status: 'PAID', paidAt: d(-28), method: '扫码', operatorId: fin.id },
      { patientId: p2.id, planId: plan2.id, stageId: p2Stage.id, name: '尾款', seq: 3, amount: 8000, dueDate: d(30), status: 'PENDING' },
    ],
  });
  // 两次已完成复诊，托槽脱落累计 3 次 → 触发“附件多次脱落”异常
  for (const [days, lost] of [[-55, 1], [-20, 2]]) {
    const ap = await prisma.appointment.create({
      data: {
        patientId: p2.id, planId: plan2.id, stageId: p2Stage.id, doctorId: drWang.id, chairId: chairs[1].id,
        startAt: d(days, 14, 0), endAt: d(days, 14, 30), type: '复诊', status: 'COMPLETED',
      },
    });
    await prisma.visitRecord.create({
      data: {
        appointmentId: ap.id, patientId: p2.id, planId: plan2.id, stageId: p2Stage.id,
        wearHours: null, hygiene: 'FAIR', attachmentLost: lost, alignerLost: false, painLevel: 1,
        paymentChecked: true, nurseNote: `托槽脱落 ${lost} 颗`, nurseId: nurse.id, nurseAt: d(days, 14, 5),
        movementOk: true, conclusion: '继续排齐，更换弓丝。', advanceAligner: false, restart: false,
        doctorAdvice: '避免啃硬物。', doctorId: drWang.id, doctorAt: d(days, 14, 25),
      },
    });
  }
  await prisma.exceptionCase.create({
    data: {
      patientId: p2.id, planId: plan2.id, stageId: p2Stage.id, type: 'ATTACHMENT_REPEATED', status: 'OPEN',
      title: '托槽（附件）多次脱落', detail: '累计脱落 3 颗（24 托槽 2 次、36 托槽 1 次），需评估粘接流程与饮食医嘱。',
      createdBy: nurse.id, createdAt: d(-20),
      tasks: { create: [{ assigneeRole: 'DOCTOR', note: '评估粘接方案与牙面处理流程' }] },
    },
  });
  await prisma.appointment.create({
    data: {
      patientId: p2.id, planId: plan2.id, stageId: p2Stage.id, doctorId: drWang.id, chairId: chairs[1].id,
      startAt: d(0, 14, 0), endAt: d(0, 14, 30), type: '复诊', status: 'SCHEDULED',
    },
  });

  // ---------- 患者 3：王一一（儿童早矫） ----------
  const p3 = await prisma.patient.create({
    data: {
      mrn: 'P20260003', name: '王一一', gender: '女', birthDate: new Date('2018-01-25'),
      phone: '13800000003', perioStatus: '乳牙列期，牙周健康。', primaryDoctorId: drLi.id,
      note: '家长主诉：口呼吸、上前牙前突。',
    },
  });
  const plan3Start = d(-40);
  const plan3 = await prisma.treatmentPlan.create({
    data: {
      patientId: p3.id, doctorId: drLi.id, type: 'PEDIATRIC', version: 1,
      revisitWeeks: 6, expectedMonths: 12, totalFee: 18000, startDate: plan3Start, expectedEnd: months(plan3Start, 12),
      note: '肌功能矫治（MRC）+ 扩弓，夜间佩戴。',
    },
  });
  const p3Stage = await prisma.treatmentStage.create({
    data: { planId: plan3.id, seq: 1, name: '早矫一期（肌功能训练）', status: 'ACTIVE' },
  });
  await prisma.paymentStage.createMany({
    data: [
      { patientId: p3.id, planId: plan3.id, stageId: p3Stage.id, name: '首期', seq: 1, amount: 9000, dueDate: d(-38), status: 'PAID', paidAt: d(-38), method: '扫码', operatorId: fin.id },
      { patientId: p3.id, planId: plan3.id, stageId: p3Stage.id, name: '尾款', seq: 2, amount: 9000, dueDate: d(120), status: 'PENDING' },
    ],
  });
  await prisma.imagingRecord.create({
    data: { patientId: p3.id, planId: plan3.id, stageId: p3Stage.id, type: 'ORAL_SCAN', version: 1, note: '初诊口扫', takenAt: d(-40), uploadedBy: nurse.id },
  });
  await prisma.appointment.create({
    data: {
      patientId: p3.id, planId: plan3.id, stageId: p3Stage.id, doctorId: drLi.id, chairId: chairs[2].id,
      startAt: d(1, 10, 0), endAt: d(1, 10, 30), type: '复诊', status: 'SCHEDULED',
    },
  });

  // ---------- 患者 4：赵之桃（固定→隐形 换方案，历史保留） ----------
  const p4 = await prisma.patient.create({
    data: {
      mrn: 'P20260004', name: '赵之桃', gender: '女', birthDate: new Date('1997-09-09'),
      phone: '13800000004', perioStatus: '牙周健康。', primaryDoctorId: drWang.id,
    },
  });
  const oldPlan = await prisma.treatmentPlan.create({
    data: {
      patientId: p4.id, doctorId: drWang.id, type: 'FIXED', version: 1, status: 'SWITCHED',
      revisitWeeks: 5, expectedMonths: 24, totalFee: 24000, startDate: d(-300), expectedEnd: months(d(-300), 24),
      switchReason: '托槽反复脱落且患者美观需求高，转入隐形矫治。',
      note: '非拔牙矫治。',
    },
  });
  const oldStage = await prisma.treatmentStage.create({
    data: { planId: oldPlan.id, seq: 1, name: '固定矫治阶段（已终止）', status: 'DONE' },
  });
  const plan4Start = d(-60);
  const plan4 = await prisma.treatmentPlan.create({
    data: {
      patientId: p4.id, doctorId: drWang.id, type: 'INVISIBLE', version: 2, parentId: oldPlan.id,
      totalAligners: 30, currentAligner: 5, alignerDays: 10, revisitWeeks: 8,
      expectedMonths: 14, totalFee: 38000, startDate: plan4Start, expectedEnd: months(plan4Start, 14),
      attachments: [{ tooth: '13', note: '优化附件' }, { tooth: '23', note: '优化附件' }],
      note: '由固定托槽方案转入，保留原方案历史判断。',
    },
  });
  const p4Stage = await prisma.treatmentStage.create({
    data: { planId: plan4.id, seq: 1, name: '第 1 阶段（第 1-10 副）', alignerFrom: 1, alignerTo: 10, status: 'ACTIVE' },
  });
  await prisma.paymentStage.createMany({
    data: [
      { patientId: p4.id, planId: plan4.id, stageId: p4Stage.id, name: '首期', seq: 1, amount: 15000, dueDate: d(-58), status: 'PAID', paidAt: d(-58), method: '刷卡', operatorId: fin.id },
      { patientId: p4.id, planId: plan4.id, stageId: p4Stage.id, name: '第二期', seq: 2, amount: 13000, dueDate: d(10), status: 'PENDING' },
      { patientId: p4.id, planId: plan4.id, name: '尾款', seq: 3, amount: 10000, dueDate: d(150), status: 'PENDING' },
    ],
  });
  // 已解决的矫治器断裂异常 + 补制技工单
  await prisma.labOrder.create({
    data: {
      patientId: p4.id, planId: plan4.id, stageId: p4Stage.id, type: 'REPAIR',
      alignerFrom: 4, alignerTo: 4, labName: '精工齿科技工所', trackingNo: 'SF1380000456',
      status: 'RECEIVED', requestedBy: nurse.id, requestedAt: d(-25), shippedAt: d(-22), receivedAt: d(-21),
      note: '第 4 副断裂补制',
    },
  });
  await prisma.exceptionCase.create({
    data: {
      patientId: p4.id, planId: plan4.id, stageId: p4Stage.id, type: 'ALIGNER_BROKEN', status: 'RESOLVED',
      title: '矫治器断裂（第 4 副）', detail: '患者摘戴时断裂，无碎片误吞。', impactDays: 3,
      createdBy: front.id, resolution: '技工所补制第 4 副，已到件并交付患者。', createdAt: d(-25), resolvedAt: d(-21),
      tasks: {
        create: [
          { assigneeRole: 'LAB', note: '补制第 4 副矫治器', done: true, doneAt: d(-22), doneBy: lab.id },
          { assigneeRole: 'RECEPTION', note: '到件后通知患者取件', done: true, doneAt: d(-21), doneBy: front.id },
        ],
      },
    },
  });

  // ---------- 时间轴（节选，与上述数据对应） ----------
  const tl = [];
  const push = (patientId, stageId, kind, title, days, actorId, detail) =>
    tl.push({ patientId, stageId, kind, title, detail: detail || null, actorId: actorId || null, createdAt: d(days, 16, 0) });
  push(p1.id, p1Stages[0].id, '建档', '患者建档，记录口扫/面像/全景片与牙周情况', -120, nurse.id);
  push(p1.id, p1Stages[0].id, '方案', '创建隐形矫治方案 v1（40 副，预计 18 个月）', -120, drWang.id);
  push(p1.id, p1Stages[1].id, '复诊', '复诊完成：进入第 12 副', -20, drWang.id);
  push(p1.id, p1Stages[1].id, '技工', '技工所发出第 13-24 副矫治器', -10, lab.id);
  push(p2.id, p2Stage.id, '建档', '患者建档（固定托槽方案）', -90, nurse.id);
  push(p2.id, p2Stage.id, '异常', '托槽多次脱落异常已立案', -20, nurse.id);
  push(p3.id, p3Stage.id, '建档', '患者建档（儿童早矫方案）', -40, nurse.id);
  push(p4.id, oldStage.id, '换方案', '固定托槽方案转入隐形矫治（历史保留）', -60, drWang.id);
  push(p4.id, p4Stage.id, '方案', '创建隐形矫治方案 v2（30 副）', -60, drWang.id);
  push(p4.id, p4Stage.id, '异常', '矫治器断裂已处理：补制到件', -21, lab.id);
  await prisma.timelineEvent.createMany({ data: tl });

  console.log('[seed] 完成：4 名患者 / 4 个方案 / 7 个账号 / 4 个椅位');
}

main()
  .catch((e) => { console.error('[seed] 失败', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
