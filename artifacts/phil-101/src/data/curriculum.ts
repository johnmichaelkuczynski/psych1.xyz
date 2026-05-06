// AUTO-GENERATED from attached_assets/Clean_Psych_101_Course_Book.docx — verbatim curriculum content.

export interface Module {
  id: string;
  number: number;
  title: string;
  points: number;
  type: "discussion" | "essay" | "termpaper";
  objectives: string[];
  reading: string;
  assignment: string;
  modelResponse: string;
}

export const modules: Module[] = [
  {
    id: "d1",
    number: 1,
    title: "Discussion 1: Branches of Psychology",
    points: 50,
    type: "discussion",
    objectives: [
      "Identify three foundational branches of psychology and the kinds of questions each investigates.",
      "Distinguish a psychological question from a purely philosophical question and justify the distinction.",
    ],
    reading: `Psychology is the scientific study of mind and behavior. It is typically divided into several major branches, three of which are foundational to any introductory course:

Cognitive Psychology — The study of mental processes
- How do people perceive, attend to, and remember information?
- How do we form concepts, solve problems, and make decisions?
- What are the limits of human attention and working memory?
- How do mental representations relate to behavior?

Behavioral Psychology — The study of observable behavior and learning
- How is behavior shaped by reinforcement and punishment?
- How do organisms acquire new responses to stimuli?
- Can behavior be explained without appealing to inner mental states?
- How do environmental contingencies maintain or extinguish behavior?

Social Psychology — The study of how people are influenced by others
- How do groups shape individual behavior?
- Why do people conform, obey, or defy authority?
- How are attitudes formed, maintained, and changed?
- What causes prejudice, aggression, and helping behavior?`,
    assignment: `Assignment (50 points):
1. Choose one of the 3 branches of psychology
2. Create an original psychological question that this branch would investigate
3. Explain in detail:
   - Why this question belongs to your chosen branch
   - What makes it a psychological rather than purely philosophical question
   - What research methods might be used to investigate it
   - What potential findings might be considered`,
    modelResponse: `Model Response:
Branch: Cognitive Psychology
Question: Does heavy reliance on smartphone navigation impair the formation of mental maps in young adults?

Analysis: This question belongs squarely within cognitive psychology because it concerns mental representation, spatial memory, and attention — all core topics in the field. When a person uses turn-by-turn GPS navigation repeatedly, they outsource the cognitive work of building a mental map of their environment to the device. The question is whether this changes the underlying cognitive architecture: are users still encoding spatial layouts, or are they encoding only the next instruction?

Consider: A college student commutes to campus daily for two years using GPS for every trip. If asked to draw a map of the route from memory, or to find an alternative path when a road is closed, will they perform worse than a peer who navigated the same route without GPS? The cognitive psychologist wants to know whether spatial knowledge is being acquired at all, or whether the device is replacing the mental representation rather than supplementing it.

This raises deeper cognitive questions about:
1. The relationship between active engagement and memory encoding
2. Whether cognitive offloading impairs the underlying skill or simply changes when it is used
3. How attention allocation during navigation shapes long-term spatial memory
4. Whether the hippocampus is differentially engaged during GPS use versus self-directed navigation

This is a psychological rather than purely philosophical question because it can be investigated empirically. Researchers can compare two groups of participants — heavy GPS users versus map-and-landmark navigators — on standardized spatial memory tasks (sketch-map accuracy, route reversal, novel shortcut finding). They can measure brain activity using fMRI during navigation. They can run longitudinal studies tracking spatial memory across years of habit formation.

My prediction is that heavy GPS reliance does impair the formation of detailed allocentric mental maps, while leaving egocentric, instruction-following memory intact. This would suggest that spatial cognition exists on a spectrum, and that the brain encodes only what attention is directed toward.

Why This is a Model Response:
1. Clear structure and organization:
   - States chosen branch clearly
   - Presents original question
   - Develops analysis systematically
2. Demonstrates understanding of cognitive psychology:
   - Properly situates question within the branch
   - Shows why it is empirically tractable
   - Engages with core concepts about memory and attention
3. Original thinking:
   - Uses contemporary example (smartphone navigation)
   - Creates specific scenario (campus commute)
   - Develops novel implications
4. Depth of analysis:
   - Identifies multiple sub-questions
   - Considers competing predictions
   - Proposes nuanced view (spectrum, allocentric vs. egocentric)
5. Clear writing:
   - Uses concrete examples
   - Avoids unnecessary jargon
   - Maintains logical flow
6. Meets assignment requirements:
   - Explains why question fits the branch
   - Discusses appropriate research methods
   - Considers possible findings`,
  },
  {
    id: "e1",
    number: 2,
    title: "Essay 1: The Stanford Prison Experiment",
    points: 50,
    type: "essay",
    objectives: [
      "Summarize Zimbardo's Stanford Prison Experiment and explain how participants formed beliefs about their roles.",
      "Design a modern situational manipulation that would impart institutional authority to ordinary participants.",
    ],
    reading: ``,
    assignment: `Write your essay for someone unfamiliar with this class, like a fellow student who isn't taking psychology. Clearly label each section.
Section 1 (30 points) - The Stanford Prison Experiment
- Summarize Philip Zimbardo's Stanford Prison Experiment in your own words
- Explain how participants formed beliefs about their roles
- Analyze why the experiment was terminated early
- Evaluate whether the study reveals something genuine about human nature
- Support your position with reasons
Section 2 (20 points) - Imparting False Beliefs: A Modern Replication
- Describe how you would design a modern study to convince ordinary participants that they hold institutional authority over others
- Assume participants come in believing they are equal volunteers
- Provide specific procedural details and thorough explanation
- Focus on situational manipulation rather than verbal instruction
Notes:
- No minimum/maximum word count (typical range: 1-5 pages)
- Include Works Cited page if using external sources
- Cite using any standard format (APA preferred)
- Label sections clearly with bold numbers or titles`,
    modelResponse: `Model Essay: The Stanford Prison Experiment
Section 1: The Stanford Prison Experiment

In August 1971, psychologist Philip Zimbardo converted the basement of the Stanford psychology building into a mock prison. He recruited twenty-four male college students through a newspaper ad and paid them $15 a day to participate in what was planned as a two-week study of prison life. By a coin flip, half were assigned the role of guard and half the role of prisoner. The prisoners were arrested at their homes by real Palo Alto police, booked, stripped, and given numbered smocks. The guards were issued uniforms, mirrored sunglasses, and wooden batons.

Participants formed beliefs about their roles through situational cues rather than through any inner conviction. The guards had no training and no script. Yet within thirty-six hours, they began enforcing arbitrary rules, humiliating prisoners, and inventing punishments. Prisoners, for their part, began referring to themselves by their numbers, breaking down emotionally, and in some cases begging to be released. The roles, assigned by chance, became identities.

Zimbardo terminated the experiment on day six rather than running it the planned two weeks. The trigger was a visit from his then-girlfriend Christina Maslach, who, on seeing prisoners being marched to the bathroom with bags over their heads, told him the study was monstrous. By that point, one prisoner had been released after an emotional breakdown, others were showing acute stress symptoms, and Zimbardo himself had slipped into the role of prison superintendent rather than experimenter.

Does the study reveal something genuine about human nature? I argue it reveals something genuine about situations, not human nature. The standard reading — that ordinary people will become brutal when given power — has been heavily challenged. Recent reanalyses show Zimbardo coached the guards toward harshness, that some guards refused to be cruel, and that the most aggressive guard later admitted he was performing what he thought the experimenters wanted. What the study reliably shows is narrower but still important: with the right uniform, the right architecture, and authority figures setting expectations, ordinary people will quickly inhabit roles that produce harm.

Section 2: Imparting False Beliefs: A Modern Replication

To convince ordinary participants that they hold institutional authority, I would design a study using systematic situational cues, building authority belief through environment rather than instruction:

1. Bring participants individually to a research building with security checkpoints, badge readers, and signage referring to a fictional 'Behavioral Compliance Unit.' Real architecture creates real belief.
2. Have a confederate in business attire greet them, address them as 'Officer [Lastname],' and hand them a uniform, an ID badge, and a thick procedural manual.
3. Place them at a desk with a computer terminal already logged in under their officer name, with case files of 'subjects' awaiting their review.
4. Have other confederates act as subordinate staff who defer to them, request signatures, and address them with formal titles.

The key is consistency and graduated commitment. Rather than telling participants 'you have authority,' the entire physical and social environment treats them as if they already do. Each small request for compliance — sign this, review that, decide on the next case — escalates their identification with the role. Within hours, ordinary participants would be making decisions affecting fictional subjects with the casual confidence of long-tenured officials, exploiting the same situational dynamics Zimbardo discovered.

Why This is a Model Response:
1. Structure and Organization:
   - Clear sections with logical flow
   - Builds understanding progressively
   - Strong transitions between ideas
2. Analysis Depth:
   - Goes beyond mere summary
   - Engages with contemporary critiques of the study
   - Connects concepts meaningfully
3. Original Thinking:
   - Novel interpretation distinguishing situation from human nature
   - Creative replication design using environmental cues
   - Thoughtful examples
4. Writing Quality:
   - Clear, engaging prose
   - Concrete details
   - Appropriate scientific tone
5. Assignment Adherence:
   - Addresses all required points
   - Balances sections appropriately
   - Maintains focus on key questions
6. Critical Thinking:
   - Evaluates multiple perspectives, including critiques of the original study
   - Supports claims with reasoning
   - Considers methodological implications`,
  },
  {
    id: "d2",
    number: 3,
    title: "Discussion 2: Classical, Operant, and Observational Conditioning",
    points: 50,
    type: "discussion",
    objectives: [
      "Distinguish classical, operant, and observational learning by their defining criteria.",
      "Construct an original everyday example that satisfies each part of one chosen learning-type definition.",
    ],
    reading: `Three foundational forms of learning identified by twentieth-century psychology:

Classical Conditioning (Pavlov):
- A neutral stimulus is paired with an unconditioned stimulus that automatically produces a response
- After repeated pairing, the neutral stimulus alone produces the response
- Learning is involuntary and reflexive

Operant Conditioning (Skinner):
- A voluntary behavior is followed by a consequence (reinforcer or punisher)
- Reinforcement increases the future frequency of that behavior; punishment decreases it
- Learning is shaped by the contingency between behavior and outcome

Observational Learning (Bandura):
- A learner acquires a new behavior by watching another person perform it
- No direct reinforcement of the learner is required
- Attention, retention, reproduction, and motivation determine whether the behavior is acquired`,
    assignment: `Assignment (50 points):
Choose one of these three forms of learning. Write a post that:
1. States your chosen type
2. Presents an original example from everyday life
3. Analyzes how your example satisfies each part of the definition
4. Explains what makes this a clear case of your chosen type rather than one of the others`,
    modelResponse: `Model Response:
Type: Operant Conditioning
Example: A toddler learns that throwing food off the high chair makes the family dog run over and lick it up. The toddler laughs. By dinner the next night, the toddler is throwing food off the chair every few seconds.

Analysis: This fits the three components of operant conditioning:
1. Voluntary behavior: The toddler is not reflexively releasing the food; they are deliberately picking it up and dropping it.
2. Consequence: The dog appears, eats the food, and the toddler is amused. This is a positive reinforcer — something the toddler finds rewarding follows the behavior.
3. Increased frequency: Because the consequence is rewarding, the behavior occurs more often. By the second night, food-throwing has become a stable repertoire.

What makes this clearly operant rather than classical or observational:
- Unlike classical conditioning, no neutral stimulus is being paired with an automatic response. The dropping is not reflexive.
- Unlike observational learning, the toddler did not watch someone else throw food and get rewarded. The contingency was discovered through the toddler's own action.
- The defining feature — behavior emitted, consequence delivered, frequency changed — is operant.

Why This is a Model Response:
1. Clarity:
   - States type immediately
   - Uses clear, realistic example
   - Maps example to definition precisely
2. Analysis:
   - Shows how each criterion applies
   - Distinguishes from other types of learning
   - Demonstrates understanding of key concepts
3. Format:
   - Concise structure
   - Clear organization
   - Focused analysis
4. Example Choice:
   - Relatable, observable scenario
   - Clear behavior-consequence link
   - Unambiguous categorization`,
  },
  {
    id: "e2",
    number: 4,
    title: "Essay 2: Cognitive Dissonance",
    points: 50,
    type: "essay",
    objectives: [
      "Define cognitive dissonance and describe how it shapes behavior in daily life.",
      "Explain one major dissonance-reduction strategy and ground it in the empirical literature.",
    ],
    reading: ``,
    assignment: `Write a clear, well-reasoned essay addressing the theory of cognitive dissonance. Your audience is a fellow student unfamiliar with psychology.
Section 1: Introduction (10 points)
- Define cognitive dissonance in your own words
- Provide a brief roadmap for your paper's remaining sections
Section 2: Living with Dissonance (20 points)
Describe a hypothetical day in which a person experiences a strong cognitive dissonance:
- Holds two contradictory beliefs or holds a belief inconsistent with their behavior
- Cannot easily resolve the contradiction
Explain:
- How they would behave
- How their actions and reasoning would differ from a person without dissonance
- Specific examples from their hypothetical day
Section 3: Responding to Dissonance (20 points)
Present ONE major strategy people use to reduce cognitive dissonance:
- Take the perspective of a researcher explaining the strategy
- Can draw from course readings (Festinger, Aronson, Cooper) or other sources
- If using external sources, include citations`,
    modelResponse: `Model Response:
The Pressure to Be Consistent: Living Through Cognitive Dissonance

Introduction
Cognitive dissonance is the psychological discomfort a person experiences when they hold two beliefs that contradict each other, or when their behavior contradicts something they believe about themselves. The theory, introduced by Leon Festinger in 1957, claims this discomfort is unpleasant enough that people are motivated to reduce it — by changing their beliefs, changing their behavior, or rationalizing the contradiction away. In this essay, I will describe what it would be like to spend a day in the grip of strong dissonance, and I will then explain one of the most thoroughly researched strategies for resolving it: effort justification.

Living with Dissonance
Imagine waking up one morning as Maya, a thirty-year-old who considers herself an environmentalist. She has spent years posting about climate change, donating to conservation groups, and arguing with relatives about the urgency of reducing carbon emissions. Yesterday, however, she signed a two-year lease on a large gasoline SUV because the monthly payment was lower than the electric option. This morning, putting gas in the new vehicle, she feels something she cannot quite name — a tightness, a need to look away from herself.

This is dissonance. The cognition 'I am an environmentalist' clashes directly with the cognition 'I just committed to two years of a high-emission vehicle.' Throughout the day, the contradiction shapes her behavior in subtle ways. She avoids her group chat with her conservation friends. She finds herself unusually irritated when a coworker mentions electric cars. At lunch, she steers the conversation toward the supposed environmental costs of lithium mining, an argument she has previously dismissed as fossil-fuel propaganda. By evening she has started telling herself that her SUV is 'actually more efficient than the older car it replaced,' a claim she has not verified.

Her behavior differs from someone without dissonance in a specific way: she is doing extra cognitive work to protect a self-image. A person who does not see themselves as an environmentalist would simply have bought the cheaper car and moved on. Maya, by contrast, is now generating arguments, avoiding people, and selectively attending to information — all to make her behavior consistent with her identity, or her identity consistent with her behavior.

The Effort Justification Response
As a researcher explaining this, I would point to one of the most well-documented dissonance-reduction strategies: effort justification. When a person freely chooses an action that turns out to conflict with their values, they often resolve the dissonance not by changing the behavior — which has already happened and is costly to reverse — but by upgrading their evaluation of the chosen option.

The classic demonstration is Aronson and Mills (1959), who showed that participants who had to undergo an embarrassing initiation to join a group later rated the group as more interesting and worthwhile than participants who had undergone a mild initiation. The dissonance — 'I suffered to join this' versus 'this group is mediocre' — was resolved by inflating the perceived value of the group.

Maya is showing the same pattern. The car cannot be returned without significant cost, so the dissonance is resolved upstream: the car gets reframed as 'actually pretty efficient,' the environmentalist identity gets quietly narrowed to 'I recycle and care,' and the apparent contradiction dissolves. The discomfort is gone, but at the price of a slightly distorted picture of reality.

Cognitive dissonance theory is powerful because it predicts something counterintuitive: people often become more committed to their bad decisions, not less. The very fact that a choice was costly, public, or difficult to reverse is what drives the rationalization. Understanding this mechanism is essential for understanding why arguing with someone about a freely chosen behavior — a purchase, a vote, a relationship — so rarely changes their mind.

Works Cited
Aronson, E., & Mills, J. (1959). The effect of severity of initiation on liking for a group. Journal of Abnormal and Social Psychology, 59(2), 177–181.
Festinger, L. (1957). A Theory of Cognitive Dissonance. Stanford University Press.

Analysis of Model Response:
This response excels for several reasons:
- Clear Structure: well-organized sections with clear transitions; introduces concepts before analyzing them; builds logically from definition to lived example to research-backed mechanism.
- Effective Examples: uses a concrete, contemporary scenario; shows rather than tells how dissonance affects daily behavior; makes abstract psychological concepts accessible.
- Strong Argumentation: cites a classic empirical demonstration (Aronson & Mills); shows understanding of the mechanism, not just the label; develops original example while grounding in established research.
- Writing Quality: appropriate for target audience (fellow student); clear, engaging prose; professional academic tone while remaining accessible.
- Psychological Depth: demonstrates understanding of dissonance theory's predictions; engages seriously with implications for everyday reasoning; makes meaningful contribution through specific application.`,
  },
  {
    id: "d3",
    number: 5,
    title: "Discussion 3: Memory and Eyewitness Testimony",
    points: 50,
    type: "discussion",
    objectives: [
      "Explain why human memory is reconstructive rather than a recording.",
      "Construct an original eyewitness scenario that demonstrates the postevent information effect.",
    ],
    reading: `Background: Memory has historically been imagined as a kind of recording — events go in, and at retrieval they come back out more or less as stored. Psychological research, especially the work of Elizabeth Loftus, has shown that human memory is reconstructive. At each retrieval, memories are reassembled from fragments, and that reassembly is vulnerable to:
- Leading questions and suggestion
- Information encountered after the original event
- The retriever's own expectations and schemas

This has serious consequences for eyewitness testimony, where confidence and accuracy are often only weakly related.`,
    assignment: `Assignment (50 points):
Construct an original case demonstrating how an eyewitness memory could be both vivid and confidently held, yet substantively wrong. Your response should:
- Present a scenario with a witness, an event, and a post-event influence
- Explain how each element of the scenario maps onto reconstructive memory theory
- Explain why intuition would treat the witness as reliable, and why that intuition is misleading`,
    modelResponse: `Model Response:
Daniel witnesses a minor car accident at an intersection. A blue sedan and a red truck collide. Daniel sees the impact for perhaps two seconds while walking to his car across the parking lot. He calls 911 and gives a statement: blue sedan ran the red light, hit the red truck.

Two days later, a detective interviewing Daniel asks: 'Did the blue sedan that ran the stop sign hit the truck before or after the truck started turning?' Daniel is now asked the same questions multiple times over the next week by an insurance investigator who refers consistently to 'the stop sign.' At trial six months later, Daniel testifies under oath: the blue sedan ran a stop sign and struck the turning truck. He is certain. He can picture the stop sign clearly.

There was no stop sign. The intersection had a traffic signal.

This is a reconstructive memory case because:
1. Initial encoding was thin: two seconds of peripheral attention while walking.
2. Post-event information was introduced through the detective's leading question, which presupposed a stop sign.
3. Repetition of the false detail, especially under conditions of authority and seriousness, integrated 'stop sign' into the reconstructed memory.
4. Daniel's high confidence is generated by the vividness of the now-reconstructed scene, not by the fidelity of the original encoding.

Yet intuition treats Daniel as reliable. He saw it. He is sober, articulate, and has no motive to lie. Juries, lawyers, and Daniel himself confuse confidence with accuracy. The misleading intuition is that memory works like video. It does not. Memory reconstructs at retrieval, and what gets reconstructed includes whatever has been added to the file since the original event.

This illustrates Loftus's central insight: the postevent information effect is not a bug experienced by unusual people. It is the standard operation of normal human memory, and confident eyewitnesses are routinely, sincerely wrong.

Analysis of Model Response:
The response excels because it:
- Presents a clear, original case of reconstructive memory failure
- Explicitly maps each element to the underlying mechanism
- Names the specific empirical phenomenon (postevent information effect) and ties it to a known researcher
- Uses an accessible scenario while preserving conceptual rigor
- Distinguishes confidence from accuracy, the central counterintuitive point`,
  },
  {
    id: "e3",
    number: 6,
    title: "Essay 3: The Reliability of Memory",
    points: 50,
    type: "essay",
    objectives: [
      "Analyze Loftus and Pickrell's lost-in-the-mall study and explain why it challenges the recording model of memory.",
      "Propose a constructive model of memory and defend it against the recording view.",
    ],
    reading: ``,
    assignment: `Section 1: Introduction (10 points)
- Define memory and the traditional 'recording' model
- Preview your paper's structure
Section 2: Analysis of the Lost-in-the-Mall Study (30 points)
- Summarize Loftus and Pickrell's 'lost in the mall' false memory study
- Explain why it challenges the recording model
Section 3: A Better Model (20 points)
- Propose what an accurate model of memory must include to account for the findings
- Show how your model handles the lost-in-the-mall results
- Explain why your model improves on the recording view`,
    modelResponse: `Model Response:
Beyond the Recording Model

Introduction
Common sense treats memory as a kind of recording: events are captured at the time of encoding, stored in some neural archive, and played back at retrieval. Under this model, the central failure mode of memory is forgetting — the recording fades or is lost. Elizabeth Loftus's work demonstrates the inadequacy of this view through experiments in which entirely false memories of personal childhood events are successfully implanted in adult participants.

The Lost-in-the-Mall Study
Loftus and Pickrell (1995) recruited adult participants and obtained, from each participant's family member, three true childhood events. The researchers added a fourth, fabricated event: getting lost in a shopping mall around age five, becoming distressed, and being rescued by an elderly stranger. The fabricated event was presented to participants alongside the three real ones in interviews, with light prompting to remember details.

After repeated interviews, roughly a quarter of participants reported remembering the false event, often supplying their own elaborate details — what the stranger looked like, what they were wearing, how scared they felt. Some participants rated the false memory as more vivid than the real ones. When debriefed, several refused to believe the event had not happened.

This devastates the recording model. There was no original event to be recorded. Yet the memory exists, is vivid, is accompanied by emotional detail, and is held with confidence. The recording model has no account of where this memory came from. If memory were storage and retrieval, this should be impossible.

A Better Model
Memory is better understood as constructive. Each act of remembering is a fresh assembly of fragments — sensory traces, emotional tones, contextual schemas, suggestions from the present environment — into a coherent narrative. The neural substrate stores fragments and patterns, not unified episodes. The unified episode is generated at retrieval.

Under this model, a false memory like the lost-in-the-mall implant is not surprising. The participant has fragments — being in malls, being scared as a child, the scripted shape of a 'lost child' narrative — and a present-tense suggestion that this happened to them. At retrieval, the brain assembles these fragments into a coherent episode using the same machinery it uses for true memories. The episode feels real because the assembly process is the same one that produces real memories.

This model improves on the recording view in three ways. First, it predicts the implant effect rather than being embarrassed by it. Second, it predicts that confidence and accuracy will dissociate, because confidence tracks the fluency of reconstruction, not the existence of an original event. Third, it explains why eyewitness testimony, leading questions, hypnotic recall, and repeated interviewing all produce systematic distortions: each adds material to the fragment pool from which future reconstructions will be drawn.

Analysis:
- Clear explanation of recording model and its limitations
- Accurate reconstruction of Loftus and Pickrell's design
- Original, well-reasoned constructive model
- Strong logical progression
- Appropriate psychological terminology
- Maintains accessibility while demonstrating sophistication`,
  },
  {
    id: "d4",
    number: 7,
    title: "Discussion 4: The Mind-Brain Problem",
    points: 50,
    type: "discussion",
    objectives: [
      "Identify the central tension between mental causation and neural explanation.",
      "Evaluate identity theory, functionalism, and eliminativism as proposed resolutions.",
    ],
    reading: `Background: Psychology presupposes that mental events — thoughts, feelings, intentions — are real and causally efficacious. Neuroscience presupposes that everything happening in a person is, at bottom, a physical process in the brain. Reconciling these two pictures is the mind-brain problem.`,
    assignment: `Assignment: Create a case demonstrating apparent mental causation of a physical event:
- Describe a specific scenario where a thought or decision seems to cause a bodily action
- Explain how this illustrates the mind-brain interaction problem
- Evaluate at least one major position on how to resolve it (identity theory, functionalism, eliminativism, property dualism)`,
    modelResponse: `Model Response:
Marcus is sitting at a coffee shop. He sees his ex-girlfriend walk in with someone new. He decides, in the space of perhaps a second, to leave through the back exit before she sees him. He stands, picks up his bag, and walks out.

This case foregrounds the interaction problem in its starkest form. Marcus's decision — a mental event with content, with a felt urgency, with a relation to past memories — seemed to cause his body to stand and move. But neurally, what occurred was a cascade of action potentials in motor cortex, basal ganglia, and spinal cord. The puzzle: are 'the decision to leave' and 'the neural cascade that produced leaving' the same event described two ways, or two events, or one event causing the other?

Identity theory says they are the same event. The decision just is the neural cascade; mental vocabulary and neural vocabulary describe one underlying process. This dissolves the interaction problem (nothing has to interact with anything) but seems to deny the apparent richness of mental life — Marcus's regret, his hope of avoiding embarrassment, his calculation about exits — all reduced to firing patterns.

Functionalism says the mental event is identified by its causal role, not its substrate. Any system implementing the right pattern of inputs and outputs would count as having that mental state. This preserves mental causation but pushes the question back: what makes a pattern of activity 'a decision' rather than mere computation?

Eliminativism takes the radical line that folk-psychological categories like 'decision' will eventually be discarded, replaced by a more accurate neural vocabulary. Marcus did not 'decide.' Some specific neural process occurred that we currently mislabel.

Each position has costs. Identity theory and eliminativism preserve physicalism at the price of either reduction or elimination of the mental. Functionalism preserves mental categories but is silent on consciousness. The mind-brain problem is that no resolution comes free.

Analysis:
- Clear, concrete example
- Demonstrates understanding of the interaction problem
- Surveys major positions accurately
- Identifies the cost of each
- Accessible while maintaining rigor`,
  },
  {
    id: "e4",
    number: 8,
    title: "Essay 4: Nature vs. Nurture",
    points: 50,
    type: "essay",
    objectives: [
      "Explain both sides of the nature-nurture debate and their implications for personality, intelligence, and mental illness.",
      "Defend a gene-environment interaction resolution against potential objections.",
    ],
    reading: ``,
    assignment: `Section 1 (30 points)
- Explain both sides of the nature-nurture debate as it appears in psychology
- Analyze the implications of each position for personality, intelligence, and mental illness
- Support with examples from research (twin studies, adoption studies, gene-environment interaction)
Section 2 (20 points)
- Present and defend your proposed resolution
- Address potential objections`,
    modelResponse: `Model Response:
Beyond the Either/Or: A Resolution of the Nature-Nurture Debate

The Debate
The nature-nurture debate poses: Are human traits primarily the product of genetic inheritance, or of environmental experience?

Position 1 (Nature): If traits are primarily genetic, then personality, intelligence, and vulnerability to mental illness are largely fixed at conception. Twin studies showing high heritability for traits like IQ (often estimated at 50–80%) and major mental illnesses like schizophrenia (around 80% concordance in identical twins) seem to support this. The implication is that interventions are constrained: education and therapy can shape but not transform the underlying disposition.

Position 2 (Nurture): If traits are primarily environmental, then early experience, parenting, culture, and life events make people who they are. Adoption studies showing that adopted children's outcomes correlate substantially with their adoptive families, and research on adverse childhood experiences predicting adult mental health, support this. The implication is that intervention is powerful and that responsibility for outcomes lies heavily on caregivers and institutions.

Proposed Resolution
The resolution accepted by contemporary behavior genetics is that the dichotomy is false. Genes and environments interact. The relevant unit of explanation is the gene-environment interaction (G×E), in which a given allele expresses different phenotypes depending on environmental conditions, and a given environment produces different effects depending on genotype.

The Caspi et al. (2003) study on the serotonin transporter gene (5-HTTLPR) is illustrative. Carrying the short allele did not, by itself, predict depression. Stressful life events did not, by themselves, predict depression with high reliability. But carriers of the short allele who experienced multiple stressful events showed substantially elevated depression rates. Neither nature nor nurture acting alone produced the outcome; the interaction did.

Under this view, asking whether intelligence is genetic or environmental is like asking whether the area of a rectangle is due to its length or its width. Heritability statistics are valid but population-specific and environment-specific — the same gene can have different heritability estimates in different cultures or eras.

This solution faces objections that it dissolves rather than answers the question, and that it makes intervention strategy harder to design. But it has the advantage of fitting the data: studies that look only at genes or only at environment routinely fail to replicate, while interaction studies are reshaping psychiatric and educational research.

Analysis:
- Clear explanation of the historical debate
- Rigorous analysis of implications for major psychological domains
- Original solution grounded in current behavior genetics
- Specific empirical citation (Caspi et al.)
- Maintains depth despite concision
- Accessible to target audience`,
  },
  {
    id: "d5",
    number: 9,
    title: "Discussion 5: Defining Mental Illness",
    points: 50,
    type: "discussion",
    objectives: [
      "Identify candidate definitions of mental illness (statistical deviance, distress, dysfunction, social deviance).",
      "Construct an original counterexample to one definition and evaluate the implications.",
    ],
    reading: `Background: Clinical psychology relies on diagnostic categories, codified in manuals like the DSM-5. But every proposed definition of mental illness faces difficulty. Major candidate definitions include:
- Statistical deviance — illness as departure from population norms
- Distress — illness as suffering experienced by the person
- Dysfunction — illness as failure of an evolved psychological mechanism to operate as designed
- Social deviance — illness as violation of cultural norms

Each definition has counterexamples — cases it wrongly includes or wrongly excludes.`,
    assignment: `Assignment:
- Present an original case that creates difficulty for one of these definitions
- Analyze why your case is a counterexample
- Evaluate what this implies about the prospects of defining mental illness`,
    modelResponse: `Model Response:
Consider statistical deviance as the definition of mental illness. The case: a man whose IQ measures 165 and whose musical ability is exceptional enough that he composes professional-quality work as a teenager. He is statistically extreme — far more deviant from the population mean than most diagnosed depressives or anxiety sufferers.

This case constitutes a counterexample because:
1. By the statistical-deviance criterion, he is more 'ill' than someone with mild depression.
2. Yet no clinician would treat him, no insurance code would apply, and his condition is not experienced as suffering or dysfunction.
3. If anything, the deviance is celebrated rather than treated.

This illustrates why pure statistical deviance fails: it conflates rare with disordered. Many illnesses are common (mild anxiety) and many extremes are valuable (high intelligence, exceptional empathy). The criterion has no resources to distinguish desirable extremes from undesirable ones, so it must be supplemented — usually by smuggling in distress or dysfunction, at which point it is no longer purely statistical.

The deeper implication is that defining mental illness purely by appeal to natural facts is unlikely to succeed. Every workable definition seems to require an evaluative component — that the deviance impairs functioning the person values, or violates norms widely shared, or causes suffering the person wants relieved. This places mental illness in the same conceptual neighborhood as 'weed' (unwanted plant) rather than 'water' (H2O). The category is partly natural and partly evaluative, and clinicians work in the messy interaction between the two.

Analysis:
- Clear, original counterexample
- Strong logical analysis of why the case breaks the definition
- Addresses key conceptual issues in clinical psychology
- Evaluates implications honestly
- Maintains rigor while accessible`,
  },
  {
    id: "e5",
    number: 10,
    title: "Essay 5: The Milgram Obedience Studies",
    points: 50,
    type: "essay",
    objectives: [
      "Reconstruct the Milgram obedience paradigm with precision.",
      "Assess the moral responsibility of obedient participants and compare to non-coerced action.",
    ],
    reading: ``,
    assignment: `Section 1: The Case (20 points)
Construct a description of the Milgram obedience paradigm:
- Clear setup and instructions to the participant
- Specific consequences participant believes their actions produce
- Available options for refusal
Section 2: Analysis (30 points)
- Assess the moral responsibility of the participant who continues administering shocks
- Compare to a non-coerced version (administering the same shocks without an authority present)
- Support with reasoning that draws on Milgram's findings`,
    modelResponse: `Model Response:
Moral Responsibility Under Authority

The Case
In Milgram's classic paradigm, an adult participant is recruited under the cover story that the study concerns learning. They are assigned the role of 'teacher' (the assignment is rigged — they always become the teacher). A confederate plays the role of 'learner' and is strapped to a chair in an adjacent room with electrodes on his arm. The teacher is told to administer increasing electric shocks for each wrong answer.

The shock generator displays voltages from 15 to 450, labeled from 'Slight Shock' to 'XXX.' At 150 volts, the learner begins to scream and demand to be released. At 300 volts, he stops responding. The experimenter, in a lab coat, instructs the teacher: 'Please continue. The experiment requires that you continue. You have no other choice.' The teacher can refuse, leave the room, or insist on stopping. Approximately 65% of participants administered shocks all the way to 450 volts.

Analysis
Under authority pressure, the participant retains substantial moral responsibility. While the laboratory situation severely constrained perceived options, the participant still chose this action over alternatives (refusing, walking out, demanding to check on the learner).

Compare to a non-coerced version: a person who, on their own initiative, administered painful electric shocks to a stranger for incorrect answers would be regarded as morally monstrous and would face full responsibility. The presence of authority mitigates blame but does not eliminate it because:
1. The choice to continue remained available at every step.
2. Multiple participants did refuse, demonstrating that refusal was possible.
3. The participant's reasoning capacity was intact — they showed visible distress, hesitation, and protest, which means they recognized the wrongness.

Milgram's central insight is not that people are evil. It is that ordinary people, embedded in a hierarchical situation, will do things they themselves would judge wrong if asked outside the situation. The moral lesson is therefore aimed less at the individual participant than at the design of institutions: situations that distribute responsibility upward through chains of command, that frame harmful acts as administrative rather than personal, reliably produce harmful behavior from people who in other contexts behave decently. Responsibility persists, but so does the warning that human moral judgment is more situationally fragile than we like to believe.

Analysis:
- Clear paradigm description
- Precise ethical analysis
- Demonstrates understanding of Milgram's actual findings, not the popularized version
- Supports claims with reasoning
- Maintains psychological depth`,
  },
  {
    id: "d6",
    number: 11,
    title: "Discussion 6: Cognitive Biases",
    points: 50,
    type: "discussion",
    objectives: [
      "Identify a major cognitive bias (confirmation, availability, anchoring, hindsight) and how it operates.",
      "Use an original case to challenge the rational-agent model of human reasoning.",
    ],
    reading: ``,
    assignment: `Assignment:
- Choose one cognitive bias (confirmation bias, availability heuristic, anchoring, hindsight bias)
- Present an original case demonstrating the chosen bias
- Analyze why it challenges the assumption that people reason as rational agents`,
    modelResponse: `Model Response:
Two job interviewers, sitting on the same hiring panel: One reviews the candidate's resume before the interview and notes that the candidate attended a prestigious university. The other has not seen the resume. After a thirty-minute interview, both interviewers are asked to rate the candidate's intelligence. The first rates significantly higher than the second.

This illustrates anchoring because:
1. Both interviewers received identical interview information.
2. The prestige cue served as an anchor for the first interviewer, who insufficiently adjusted away from it.
3. The judgment of 'intelligence' was then biased toward the anchor in ways the first interviewer did not detect.

This challenges the rational-agent model assumed by classical economics and much of folk psychology. Under that model, a rational evaluator integrates relevant information and disregards irrelevant cues. The anchoring effect shows that even people who explicitly believe they are evaluating evidence on its merits are pulled by reference points they consider irrelevant — and crucially, they are unaware of being pulled. Self-report cannot detect the bias. The first interviewer would sincerely deny that the university name affected the rating.

The deeper challenge is that this is not a failure of motivation or effort. Anchoring effects appear in expert judges, experienced clinicians, and trained statisticians. The bias is a feature of how human cognition handles uncertainty under time pressure, not a flaw of insufficiently careful thinkers. Rational agency, in the sense classical theory requires, is not the natural operating mode of the human mind.

Analysis:
- Clear example of anchoring
- Shows understanding of how the bias operates
- Challenges the rational-agent model effectively
- Concise while maintaining depth`,
  },
  {
    id: "d7",
    number: 12,
    title: "Discussion 7: The Bystander Effect",
    points: 50,
    type: "discussion",
    objectives: [
      "Explain the diffusion-of-responsibility mechanism behind the bystander effect.",
      "Connect the empirical findings to questions about moral responsibility in groups.",
    ],
    reading: ``,
    assignment: `Assignment:
You are walking through a busy public square when you see someone collapse. Forty other people see it too. Analyze:
- How you would behave
- Whether your behavior would be different if you were the only witness
- What this reveals about moral responsibility in groups`,
    modelResponse: `Model Response:
Walking through the square, I would like to believe I would act immediately. The honest prediction, grounded in the bystander research, is that I would hesitate. I would scan the other witnesses. I would assume someone better-positioned, more medically trained, or more authoritative was already responding. I would walk slightly slower, ready to help if needed, and probably do nothing.

If I were the only witness — the same collapse on a deserted side street — the calculus would shift entirely. There is no diffusion of responsibility because there is no one to diffuse to. The person needs help, no one else can provide it, and I act.

This pattern — Latané and Darley's bystander effect — reveals that moral responsibility, as it is actually felt rather than as moral theory describes it, is not a fixed quantity attached to each person who witnesses harm. It is divided across the witnesses, and the larger the group, the smaller each person's felt share. This is psychologically real, has been replicated for sixty years, and operates without any individual recognizing it.

The disturbing implication is that public spaces, designed for safety, can be moral dead zones precisely because of the crowd. The lesson I would take from the literature is to act as if I am the only witness, and to address potential helpers by name or pointing — 'You, in the blue jacket, call 911' — because direct individuation is the only reliable way to break the diffusion.

Analysis:
- Acknowledges psychological reality rather than romanticizing
- Shows understanding of Latané and Darley's mechanism
- Connects to moral responsibility and intervention design
- Demonstrates psychological depth`,
  },
  {
    id: "tp",
    number: 13,
    title: "Term Paper (Outline + Final)",
    points: 200,
    type: "termpaper",
    objectives: [
      "Construct a detailed outline that summarizes a chosen article's argument and a critical objection.",
      "Defend an original thesis against an objection in a complete, well-cited term paper.",
    ],
    reading: ``,
    assignment: `PART 1 — TERM PAPER OUTLINE (100 points)

Choose one article:
- Daniel Kahneman, "A Perspective on Judgment and Choice: Mapping Bounded Rationality" (American Psychologist, 2003)
- Carol Dweck, "Mindsets and Human Nature: Promoting Change in the Middle East, the Schoolyard, the Racial Divide, and Willpower" (American Psychologist, 2012)
- Steven Pinker and Paul Bloom, "Natural Language and Natural Selection" (Behavioral and Brain Sciences, 1990)

Create a detailed outline with:
Introduction (5%)
- Article overview
- Your chosen argument
- Section previews
Argument Summary (40%)
- Key definitions
- Article's scope/purpose
- Chosen argument analysis
Critical Objection (25%)
- Original counterargument
- Supporting examples
- Implications
Critical Response (25%)
- Defense against objection
- Policy or research proposals
- Practical implications
Conclusion (5%)
- Key points review
- Broader significance

PART 1 MODEL OUTLINE:
Model Response:
Mindset and Achievement: Analysis of Dweck's Core Argument

I. Introduction
- Overview: Dweck argues that beliefs about the malleability of intelligence shape achievement
- Focus: Core argument that growth-mindset interventions improve student outcomes
- Preview: Will examine argument, raise replication objection, propose refinement

II. Argument Summary
A. Key Definitions
   - Fixed mindset: belief that intelligence is a stable trait
   - Growth mindset: belief that intelligence can be developed through effort
B. Article Scope
   - Defending the practical importance of mindset across multiple domains
   - Countering reductionist views that achievement is purely ability-driven
C. Core Argument Analysis
   - Mindset shapes goal orientation (mastery vs. performance)
   - Goal orientation shapes effort and persistence
   - Therefore mindset interventions improve outcomes

III. Critical Objection
A. The Replication Problem
   - Recent large-scale replications show much smaller effects than original studies
   - Effects appear strongest for low-achieving students, weak or absent for others
   - Examples: Sisk et al. (2018) meta-analysis; National Study of Learning Mindsets
   - Implications for whether the construct generalizes as claimed

IV. Critical Response
A. Modified Mindset Theory
   - Effects are real but bounded — context-dependent rather than universal
   - Mindset matters most where structural barriers also exist
   - Practical proposals:
     - Target interventions to populations where effects replicate
     - Combine mindset interventions with structural support

V. Conclusion
- Mindset is a real but smaller-scale phenomenon than originally claimed
- Balance between psychological intervention and structural change
- Implications for educational policy

Works Cited
Dweck, C. S. (2012). Mindsets and human nature: Promoting change in the Middle East, the schoolyard, the racial divide, and willpower. American Psychologist, 67(8), 614–622.
Sisk, V. F., Burgoyne, A. P., Sun, J., Butler, J. L., & Macnamara, B. N. (2018). To what extent and under which circumstances are growth mind-sets important to academic achievement? Two meta-analyses. Psychological Science, 29(4), 549–571.

Analysis:
- Clear structure following requirements
- Specific argument focus
- Original objection grounded in current replication literature
- Appropriate detail level
- Shows understanding of psychological research norms

---

PART 2 — TERM PAPER (100 points)

Choose one article:
- Kahneman: "A Perspective on Judgment and Choice"
- Dweck: "Mindsets and Human Nature"
- Pinker and Bloom: "Natural Language and Natural Selection"

Requirements:
Introduction (5%)
Argument Summary (40%)
Critical Objection (25%)
Critical Response (25%)
Conclusion (5%)
Works Cited (APA format preferred)`,
    modelResponse: `Model Response:
The Limits of Mindset: A Critique of the Generalization Claim

Introduction
Carol Dweck argues that beliefs about the malleability of intelligence — fixed versus growth mindset — substantially shape achievement across academic, social, and self-regulation domains. This paper examines her generalization claim, focusing on whether the empirical support is strong enough to justify the broad scope. I argue that the underlying phenomenon is real but considerably smaller and more context-bound than the article suggests.

Argument Summary
Dweck addresses several findings, including that growth-mindset interventions improve grades, persistence, and willpower. She claims this works because:
1. Mindset shapes how people interpret setbacks (challenges to overcome vs. evidence of fixed limits).
2. Interpretation shapes effort allocation.
3. Effort allocation shapes outcomes across domains.

She concludes that brief mindset interventions can produce durable improvements in achievement, even in high-stakes contexts like Middle East peacebuilding and racial-bias reduction.

Critical Objection
Dweck's analysis underweights the replication evidence accumulated since the original studies. Unlike the early laboratory work, large-scale meta-analyses and pre-registered replications show modest, conditional effects:
- Sisk et al. (2018) meta-analyzed 273 studies and found average effect sizes of roughly r = 0.10 — far smaller than the original work suggested.
- The National Study of Learning Mindsets (Yeager et al., 2019), the largest pre-registered test, found measurable effects but only for lower-achieving students in supportive school contexts.
- Effects on willpower, racial bias, and political conflict are based on much smaller and methodologically weaker studies than the academic-achievement work.

These findings do not refute mindset theory, but they refute the strong generalization claim. The mechanism is real where it works, but does not appear to be the broad psychological lever Dweck describes.

Critical Response
One might defend the generalization by arguing that the early laboratory effects were the true effects and that real-world replications underestimate them due to implementation noise. This defense is weak, however, because pre-registered designs were specifically built to address that concern, and they still produce smaller, conditional effects.

A better response is to retain the underlying mechanism while narrowing the claim:
1. Acknowledge that mindset matters most when other conditions (capable students, supportive teachers, accessible material) are already in place.
2. Treat mindset as one input among many, not a master variable.
3. Direct intervention resources to populations where replication evidence is strongest, especially struggling students in functional school environments.
4. Avoid extending the claim to domains (geopolitical conflict, structural racism) where the evidence base is thin.

Conclusion
Dweck's broader contribution — that beliefs about ability shape effort — is genuine and supported. The wider generalization to almost any domain of human striving outruns the data. Effective intervention requires acknowledging both the reality of the mechanism and its limits.

Works Cited
Dweck, C. S. (2012). Mindsets and human nature: Promoting change in the Middle East, the schoolyard, the racial divide, and willpower. American Psychologist, 67(8), 614–622.
Sisk, V. F., Burgoyne, A. P., Sun, J., Butler, J. L., & Macnamara, B. N. (2018). To what extent and under which circumstances are growth mind-sets important to academic achievement? Two meta-analyses. Psychological Science, 29(4), 549–571.
Yeager, D. S., Hanselman, P., Walton, G. M., Murray, J. S., Crosnoe, R., Muller, C., et al. (2019). A national experiment reveals where a growth mindset improves achievement. Nature, 573, 364–369.

Analysis:
- Clear thesis and argument focus
- Evidence-based objection grounded in current meta-analyses
- Practical, scaled-back proposals
- Balanced analysis that preserves the genuine contribution while limiting overreach`,
  },
];

export function moduleById(id: string): Module | undefined {
  return modules.find((m) => m.id === id);
}

export function moduleIndexById(id: string): number {
  return modules.findIndex((m) => m.id === id);
}
