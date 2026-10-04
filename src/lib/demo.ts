export function demoWorkspace() {
  const now = new Date(),
    day = now.toISOString().slice(0, 10);
  const properties = [
    {
      id: "p1",
      name: "The Parkside Apartment",
      address: "24 Oborishte Street",
      city: "Sofia",
      type: "Apartment",
      bedrooms: 2,
      area: 86,
      rent_cents: 85000,
      notes: "A bright apartment overlooking the park.",
      demo_image: "/images/ns-img-232.webp",
    },
    {
      id: "p2",
      name: "Lozenets Garden Home",
      address: "18 James Bourchier Boulevard",
      city: "Sofia",
      type: "House",
      bedrooms: 3,
      area: 142,
      rent_cents: 125000,
      notes: "Family home with a private garden.",
      demo_image: "/images/ns-img-233.webp",
    },
    {
      id: "p3",
      name: "Vitosha View Studio",
      address: "8 Cherni Vrah Boulevard",
      city: "Sofia",
      type: "Studio",
      bedrooms: 1,
      area: 48,
      rent_cents: 65000,
      notes: "Top-floor studio with mountain views.",
      demo_image: "/images/ns-img-234.webp",
    },
  ];
  const tenants = [
    {
      id: "t1",
      name: "Elena Petrova",
      email: "elena@example.com",
      phone: "+359 888 000 001",
      notes: "Sample tenant",
    },
    {
      id: "t2",
      name: "Daniel Ivanov",
      email: "daniel@example.com",
      phone: "+359 888 000 002",
      notes: "Sample tenant",
    },
  ];
  const leases = [
    {
      id: "l1",
      property_id: "p1",
      tenant_id: "t1",
      start_date: now.getFullYear() + "-01-01",
      end_date: now.getFullYear() + 1 + "-01-01",
      rent_cents: 85000,
      deposit_cents: 85000,
      due_day: 1,
      status: "active",
    },
    {
      id: "l2",
      property_id: "p2",
      tenant_id: "t2",
      start_date: now.getFullYear() + "-01-01",
      end_date: now.getFullYear() + 1 + "-06-30",
      rent_cents: 125000,
      deposit_cents: 125000,
      due_day: 1,
      status: "active",
    },
  ];
  const charges: any[] = [],
    payments: any[] = [],
    expenses: any[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      .toISOString()
      .slice(0, 7);
    leases.forEach((l, k) => {
      const paid = i === 0 && k === 1 ? 80000 : l.rent_cents;
      const id = `c${i}${k}`;
      charges.push({
        id,
        lease_id: l.id,
        month: m,
        due_date: m + "-01",
        amount_cents: l.rent_cents,
        paid_cents: paid,
      });
      payments.push({
        id: `pay${i}${k}`,
        charge_id: id,
        amount_cents: paid,
        paid_date: m + "-01",
        reference: "Sample bank transfer",
      });
    });
    expenses.push({
      id: `e${i}`,
      property_id: "p1",
      title: "Building maintenance",
      category: "Maintenance",
      amount_cents: 14000 + i * 2300,
      expense_date: m + "-01",
    });
  }
  return {
    user: {
      id: "demo",
      name: "Alex Morgan",
      email: "alex@example.com",
      company: "Greenhouse Rentals",
      currency: "EUR",
      plan: "landlord",
    },
    properties,
    tenants,
    leases,
    charges,
    payments,
    expenses,
    maintenance: [
      {
        id: "m1",
        property_id: "p1",
        title: "Kitchen tap needs attention",
        description: "Slow leak reported underneath the kitchen sink.",
        priority: "urgent",
        status: "open",
        assignee: "",
        created_at: day,
      },
      {
        id: "m2",
        property_id: "p2",
        title: "Annual boiler service",
        description: "Arrange the annual service and keep the report on file.",
        priority: "normal",
        status: "in_progress",
        assignee: "Heating contractor",
        created_at: day,
      },
    ],
    files: [],
    limits: { properties: 15, ai: 30, label: "Landlord" },
    aiUsage: 2,
    billingEnabled: false,
  };
}
