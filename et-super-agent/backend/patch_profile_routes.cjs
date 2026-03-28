const fs = require('fs');
const path = 'C:/Projects/ET Hackathon/et-super-agent/backend/src/routes/profile.ts';
let code = fs.readFileSync(path, 'utf8');

const regexEnd = /(profileRouter\.post\("\/profile\/save",[\s\S]*?res\.json\(\{[\s\S]*?saved:\s*true,[\s\S]*?profile:\s*toPublicProfile\(saved\),[\s\S]*?\}\);\s*\};\s*\}\);?)/;

const newRoutes = `  res.json({
    saved: true,
    profile: toPublicProfile(saved),
  });
});

const createLensSchema = z.object({
  sessionId: z.string().min(1),
  name: z.string().min(1).max(50),
  description: z.string().max(1000),
  tags: z.array(z.string()).max(10).default([]),
});

profileRouter.post("/profile/lens/create", async (req, res) => {
  const parsed = createLensSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  const session = sessionStore.get(parsed.data.sessionId);
  if (!session || !session.profileId) {
    res.status(404).json({ error: "Session or profile not found" });
    return;
  }

  try {
    const newLens = await profileStore.createSubProfile(session.profileId, {
      name: parsed.data.name,
      description: parsed.data.description,
      tags: parsed.data.tags,
    });
    
    // Auto-switch to new lens
    session.activeLensId = newLens.id;
    session.activeLens = newLens;
    sessionStore.set(session);

    const updatedProfile = await profileStore.getById(session.profileId);
    
    res.json({
      success: true,
      lens: newLens,
      profile: updatedProfile ? toPublicProfile(updatedProfile) : undefined
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create lens" });
  }
});

const deleteLensSchema = z.object({
  sessionId: z.string().min(1),
  lensId: z.string().min(1),
});

profileRouter.delete("/profile/lens", async (req, res) => {
  const parsed = deleteLensSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const session = sessionStore.get(parsed.data.sessionId);
  if (!session || !session.profileId) {
    res.status(404).json({ error: "Context not found" });
    return;
  }

  try {
    await profileStore.deleteSubProfile(session.profileId, parsed.data.lensId);
    if (session.activeLensId === parsed.data.lensId) {
      session.activeLensId = undefined;
      session.activeLens = undefined;
      sessionStore.set(session);
    }
    
    const updatedProfile = await profileStore.getById(session.profileId);
    res.json({ success: true, profile: updatedProfile ? toPublicProfile(updatedProfile) : undefined });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete lens" });
  }
});

const switchLensSchema = z.object({
  sessionId: z.string().min(1),
  lensId: z.string().optional(), // undefined to reset to base profile
});

profileRouter.post("/profile/lens/switch", async (req, res) => {
  const parsed = switchLensSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const session = sessionStore.get(parsed.data.sessionId);
  if (!session || !session.profileId) {
    res.status(404).json({ error: "Context not found" });
    return;
  }

  try {
    const profile = await profileStore.getById(session.profileId);
    if (!profile) throw new Error("Profile not found");

    if (parsed.data.lensId) {
      const lens = profile.subProfiles?.find(sp => sp.id === parsed.data.lensId);
      if (!lens) throw new Error("Lens not found");
      session.activeLensId = lens.id;
      session.activeLens = lens;
    } else {
      session.activeLensId = undefined;
      session.activeLens = undefined;
    }
    
    sessionStore.set(session);
    res.json({ success: true, activeLensId: session.activeLensId, activeLens: session.activeLens });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
`;

code = code.replace(/res\.json\(\{\s*saved:\s*true,\s*profile:\s*toPublicProfile\(saved\),\s*\}\);\s*\}\);?/g, newRoutes);
fs.writeFileSync(path, code);
console.log("Patched profile.ts routes!");
