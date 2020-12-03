### :earth_americas: [Seeing Earth](https://seeing.earth)

**Problem:** We don't have an accurate worldview of the fundamental drivers + causes of the environmental crisis.  As a result, our actions and discussions rarely get to the level of root causes and meaningful solutions.

**Intention:** Enable people to *see* and *understand* the largest levers impacting our environment, so we can turn our attention and energy towards the most impactful + urgent interventions.

**Example:** Today, if a person is interested in supporting rainforest conservation, most resources will point them to sustainable shopping decisions.  Unless you make that change in a way that scales (e.g. asking neighbors and your community to join you), it is a negligible intervention.

In reality, there are much more impactful ways for that person to support rainforest conservation -- for example, calling on their city/state to ban the import of unsustainable rainforest products, as [LA and NYC have started exploring](https://www.cbsnews.com/news/amazon-rainforest-wildfires-nyc-and-la-officials-urge-boycott-of-meat-companies-linked-to-amazon-fires/).

The intention behind **Seeing Earth** is to help people intuitively understand the largest causes + levers of the environmental crisis, and turn their attention towards a higher level of action.

### Context

The current version [https://seeing.earth](https://seeing.earth) is a visual proof of concept, based on a patchwork of datasets and fuzzy/subjective data wrangling to vizualize them.

The intended outcome of the MCJ Make-A-Thon is to have a scalable and compatible data schema, which can incorporate sources such as —

- [WorldMRIO Data](https://https://worldmrio.com/)
- [Electricity Map](https://www.electricitymap.org/ranking)
- [Ocean Plastic Data](https://theoceancleanup.com/sources/)
- Crowdsourced datasets

— to serve as a long-term foundation for the project.  This foundational data schema will enable us to continue adding data over time, getting a more complete picture of the largest environmental levers and causalities, and informing our actions.

*(The [WorldMRIO Data](https://https://worldmrio.com/) may be the best option for a base dataset.)*


### Potential Roadmap (to inform current architecture/design decisions)

**Modeling Across Possibilities**

When exploring any environmental lever / cause, users should be able to experiment with potential interventions, and see how a given intervention would affect the lever / cause.

As a practical example, a user could model a California import boycott on Amazonian beef products (the "intervention" could be modeled by adjusting the  data in accordance with the proposed action -- in this case, lowering the metric of Amazonian beef supplied + consumed in CA), and see what kind of difference the intervention would be expected to make.

If this was implemented by just adjusting the model data in the user's current session, then interventions could also be modeled across time -- the time series extrapolations would just be calculated based on the adjusted data.
